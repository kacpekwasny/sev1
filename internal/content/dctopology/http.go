package dctopology

import (
	"encoding/json"
	"io"
	"net/http"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

type ConfigSummary struct {
	SchemaVersion     int            `json:"schema_version"`
	Topology          TopologyConfig `json:"topology"`
	PhysicalDevices   int            `json:"physical_devices"`
	Hosts             int            `json:"hosts"`
	PhysicalLinks     int            `json:"physical_links"`
	BGPSessions       int            `json:"bgp_sessions"`
	CustomerVMs       int            `json:"customer_vms"`
	RouteServerVMs    int            `json:"route_server_vms"`
	VPCs              int            `json:"vpcs"`
	CustomerPeerCount int            `json:"customer_rs_user_peers"`
	RouteOrigins      int            `json:"route_origins"`
	TrafficRequests   int            `json:"traffic_requests"`
}

type apiResponse struct {
	OK      bool           `json:"ok"`
	Summary *ConfigSummary `json:"summary,omitempty"`
	Errors  []FieldError   `json:"errors,omitempty"`
	Message string         `json:"message,omitempty"`
}

type configStore struct {
	mu       sync.RWMutex
	writeMu  sync.Mutex
	config   Config
	snapshot Model
	loaded   bool
}

func NewAPIHandler(initialYAML []byte) (http.Handler, error) {
	config, err := ParseYAML(initialYAML)
	if err != nil {
		return nil, err
	}
	model, err := BuildTopology(config)
	if err != nil {
		return nil, err
	}
	store := &configStore{config: config, snapshot: model, loaded: true}
	return newAPIHandler(store, initialYAML), nil
}

func newAPIHandler(store *configStore, initialYAML []byte) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/status", store.status)
	mux.HandleFunc("GET /api/model", store.model)
	mux.HandleFunc("GET /api/inspector", store.inspector)
	mux.HandleFunc("GET /api/explore", store.explore)
	mux.HandleFunc("POST /api/config", store.load)
	mux.HandleFunc("POST /api/counts", store.updateCounts)
	mux.HandleFunc("GET /api/config.yaml", store.export)
	mux.HandleFunc("GET /api/default.yaml", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(initialYAML)
	})
	return mux
}

type countUpdate struct {
	Spines       int    `json:"spines"`
	Bolts        int    `json:"bolts"`
	RacksPerBolt int    `json:"racks_per_bolt"`
	HostsPerRack int    `json:"hosts_per_rack"`
	CustomerVMs  int    `json:"customer_vms"`
	ConfigYAML   string `json:"config_yaml,omitempty"`
}

func (s *configStore) updateCounts(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var counts countUpdate
	if err := decoder.Decode(&counts); err != nil {
		writeJSON(w, http.StatusBadRequest, apiResponse{Message: "niepoprawne dane liczników: " + err.Error()})
		return
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		writeJSON(w, http.StatusBadRequest, apiResponse{Message: "dozwolony jest tylko jeden obiekt JSON"})
		return
	}
	var config Config
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if counts.ConfigYAML != "" {
		parsed, err := ParseYAML([]byte(counts.ConfigYAML))
		if err != nil {
			response := apiResponse{Message: err.Error()}
			if validation, ok := err.(*ValidationError); ok {
				response.Errors = validation.Errors
			}
			writeJSON(w, http.StatusBadRequest, response)
			return
		}
		config = parsed
	} else {
		s.mu.RLock()
		config = s.config
		s.mu.RUnlock()
	}
	config.Topology.Spines = counts.Spines
	config.Topology.Bolts = counts.Bolts
	config.Topology.RacksPerBolt = counts.RacksPerBolt
	config.Topology.HostsPerRack = counts.HostsPerRack
	config.CustomerVMs.Count = counts.CustomerVMs
	config = trimRemovedCustomerReferences(config)
	if err := config.Validate(); err != nil {
		response := apiResponse{Message: err.Error()}
		if validation, ok := err.(*ValidationError); ok {
			response.Errors = validation.Errors
		}
		writeJSON(w, http.StatusBadRequest, response)
		return
	}
	model, err := BuildTopology(config)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, apiResponse{Message: err.Error()})
		return
	}
	s.mu.Lock()
	s.config = config
	s.snapshot = model
	s.loaded = true
	s.mu.Unlock()
	summary := Summarize(config)
	writeJSON(w, http.StatusOK, apiResponse{OK: true, Summary: &summary})
}

func trimRemovedCustomerReferences(config Config) Config {
	count := config.CustomerVMs.Count
	overrides := make([]CustomerVMOverride, 0, len(config.CustomerVMs.Overrides))
	for _, override := range config.CustomerVMs.Overrides {
		if override.ID <= count {
			overrides = append(overrides, override)
		}
	}
	config.CustomerVMs.Overrides = overrides
	userOrigins := make([]UserRouteOrigin, 0, len(config.RouteServers.UserOrigins))
	for _, origin := range config.RouteServers.UserOrigins {
		if origin.NextHopVMID <= count {
			userOrigins = append(userOrigins, origin)
		}
	}
	config.RouteServers.UserOrigins = userOrigins
	peers := make([]int, 0, len(config.CustomerVMs.RSUserPeers))
	for _, id := range config.CustomerVMs.RSUserPeers {
		if id <= count {
			peers = append(peers, id)
		}
	}
	config.CustomerVMs.RSUserPeers = peers
	traffic := make([]TrafficRequest, 0, len(config.Traffic))
	for _, request := range config.Traffic {
		if request.SourceVMID < 1 || request.SourceVMID > count {
			continue
		}
		if request.DestinationVMID != nil && (*request.DestinationVMID < 1 || *request.DestinationVMID > count) {
			continue
		}
		traffic = append(traffic, request)
	}
	config.Traffic = traffic
	return config
}

func (s *configStore) model(w http.ResponseWriter, _ *http.Request) {
	s.mu.RLock()
	model, loaded := s.snapshot, s.loaded
	s.mu.RUnlock()
	if !loaded {
		writeJSON(w, http.StatusConflict, apiResponse{Message: "brak poprawnej konfiguracji"})
		return
	}
	// Route candidates and per-peer advertisements are served on demand by /api/inspector.
	model.Routes.Tables = nil
	model.Routes.Advertisements = nil
	model.Routes.Forwarding = nil
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(model)
}

type inspectorResponse struct {
	OriginatedFlows []FlowExample        `json:"originated_flows,omitempty"`
	OK              bool                 `json:"ok"`
	SpeakerTable    *BGPSpeakerTable     `json:"speaker_table,omitempty"`
	Forwarding      []ForwardingEntry    `json:"forwarding,omitempty"`
	Advertisements  []RouteAdvertisement `json:"advertisements,omitempty"`
	Route           *Route               `json:"route,omitempty"`
	Message         string               `json:"message,omitempty"`
}

func (s *configStore) inspector(w http.ResponseWriter, r *http.Request) {
	kind, id := r.URL.Query().Get("kind"), r.URL.Query().Get("id")
	if id == "" {
		writeInspector(w, http.StatusBadRequest, inspectorResponse{Message: "brak identyfikatora inspektora"})
		return
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	if !s.loaded {
		writeInspector(w, http.StatusConflict, inspectorResponse{Message: "brak poprawnej konfiguracji"})
		return
	}
	result := inspectorResponse{OK: true}
	switch kind {
	case "speaker":
		result.OriginatedFlows = originatedFlowExamples(s.snapshot.Routes, id)
		for index := range s.snapshot.Routes.Tables {
			if s.snapshot.Routes.Tables[index].SpeakerID == id {
				result.SpeakerTable = &s.snapshot.Routes.Tables[index]
				break
			}
		}
		if result.SpeakerTable == nil {
			writeInspector(w, http.StatusNotFound, inspectorResponse{Message: "nie znaleziono tablicy BGP"})
			return
		}
		result.Forwarding = make([]ForwardingEntry, 0)
		for _, entry := range s.snapshot.Routes.Forwarding {
			if entry.OwnerID == id {
				result.Forwarding = append(result.Forwarding, entry)
			}
		}
	case "session":
		result.Advertisements = make([]RouteAdvertisement, 0)
		for _, advertisement := range s.snapshot.Routes.Advertisements {
			if advertisement.SessionID == id {
				result.Advertisements = append(result.Advertisements, advertisement)
			}
		}
	case "route":
		for index := range s.snapshot.Routes.Origins {
			if s.snapshot.Routes.Origins[index].ID == id {
				result.Route = &s.snapshot.Routes.Origins[index]
				break
			}
		}
		if result.Route == nil {
			writeInspector(w, http.StatusNotFound, inspectorResponse{Message: "nie znaleziono trasy"})
			return
		}
		result.Advertisements = make([]RouteAdvertisement, 0)
		for _, advertisement := range s.snapshot.Routes.Advertisements {
			if advertisement.RouteID == id {
				result.Advertisements = append(result.Advertisements, advertisement)
			}
		}
	default:
		writeInspector(w, http.StatusBadRequest, inspectorResponse{Message: "nieznany typ inspektora"})
		return
	}
	writeInspector(w, http.StatusOK, result)
}

func writeInspector(w http.ResponseWriter, status int, value inspectorResponse) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func (s *configStore) status(w http.ResponseWriter, _ *http.Request) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if !s.loaded {
		writeJSON(w, http.StatusConflict, apiResponse{Message: "brak poprawnej konfiguracji"})
		return
	}
	summary := Summarize(s.config)
	writeJSON(w, http.StatusOK, apiResponse{OK: true, Summary: &summary})
}

func (s *configStore) load(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusRequestEntityTooLarge, apiResponse{Message: "konfiguracja przekracza 1 MiB"})
		return
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	config, err := ParseYAML(data)
	if err != nil {
		response := apiResponse{Message: err.Error()}
		if validation, ok := err.(*ValidationError); ok {
			response.Errors = validation.Errors
		}
		writeJSON(w, http.StatusBadRequest, response)
		return
	}
	model, err := BuildTopology(config)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, apiResponse{Message: err.Error()})
		return
	}
	s.mu.Lock()
	s.config = config
	s.snapshot = model
	s.loaded = true
	s.mu.Unlock()
	summary := Summarize(config)
	writeJSON(w, http.StatusOK, apiResponse{OK: true, Summary: &summary})
}

func (s *configStore) export(w http.ResponseWriter, _ *http.Request) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if !s.loaded {
		http.Error(w, "brak poprawnej konfiguracji", http.StatusConflict)
		return
	}
	data, err := yaml.Marshal(s.config)
	if err != nil {
		http.Error(w, "nie można zapisać konfiguracji", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=topologia-dc.yaml")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func Summarize(config Config) ConfigSummary {
	t := config.Topology
	hosts := t.Bolts * t.RacksPerBolt * t.HostsPerRack
	leaves := t.Bolts * t.LeavesPerBolt
	tors := 2 * t.Bolts * t.RacksPerBolt
	physicalDevices := t.Borders + t.Stems + t.Spines + leaves + tors + hosts
	physicalLinks := t.Borders*t.Stems +
		t.Stems*t.Spines +
		t.Spines*leaves +
		2*t.LeavesPerBolt*t.Bolts*t.RacksPerBolt +
		2*t.Bolts*t.RacksPerBolt*t.HostsPerRack
	fabricSessions := t.Borders*t.Stems +
		t.Stems*t.Spines +
		t.Spines*leaves +
		2*t.LeavesPerBolt*t.Bolts*t.RacksPerBolt
	peerCount := len(config.CustomerVMs.RSUserPeers)
	bgpSessions := fabricSessions +
		2*hosts +
		4*hosts +
		16*t.Bolts +
		16 +
		4*t.Borders +
		4*peerCount
	return ConfigSummary{
		SchemaVersion:     config.SchemaVersion,
		Topology:          t,
		PhysicalDevices:   physicalDevices,
		Hosts:             hosts,
		PhysicalLinks:     physicalLinks,
		BGPSessions:       bgpSessions,
		CustomerVMs:       config.CustomerVMs.Count,
		RouteServerVMs:    8 + 4*t.Bolts,
		VPCs:              len(config.VPCs),
		CustomerPeerCount: peerCount,
		RouteOrigins:      len(config.RouteOrigins),
		TrafficRequests:   len(config.Traffic),
	}
}

func writeJSON(w http.ResponseWriter, status int, value apiResponse) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func NewHTTPServer(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}
}
