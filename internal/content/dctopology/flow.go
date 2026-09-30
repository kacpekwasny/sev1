package dctopology

import "fmt"

// FlowExample projects the computed exports onto a small explanatory wave sequence.
// It is a snapshot, not BGP event/convergence state.
type FlowExample struct {
	Route Route      `json:"route"`
	Steps []FlowStep `json:"steps"`
}

type FlowStep struct {
	SessionID string `json:"session_id"`
	FromID    string `json:"from_id"`
	ToID      string `json:"to_id"`
	Wave      int    `json:"wave"`
}

func buildFlowExamples(state RouteState) []FlowExample {
	byRoute := map[string][]RouteAdvertisement{}
	for _, export := range state.Advertisements {
		byRoute[export.RouteID] = append(byRoute[export.RouteID], export)
	}
	seen := map[string]bool{}
	var result []FlowExample
	for _, route := range state.Origins {
		if route.OriginKind != "customer" && route.SAFI != "evpn" {
			continue
		}
		key := fmt.Sprintf("%s/%s/%s/%d/%s", route.OriginKind, route.AFI, route.SAFI, route.RouteType, route.IPFamily)
		if seen[key] || len(byRoute[route.ID]) == 0 {
			continue
		}
		seen[key] = true
		example := FlowExample{Route: route}
		for _, export := range byRoute[route.ID] {
			example.Steps = append(example.Steps, FlowStep{SessionID: export.SessionID, FromID: export.FromID,
				ToID: export.ToID, Wave: len(export.PropagationPath) - 2})
		}
		result = append(result, example)
	}
	return result
}
