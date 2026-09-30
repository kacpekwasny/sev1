package dctopology

import (
	"fmt"
	"sort"
	"strings"
)

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

func buildFlowExamples(model Model, state RouteState) []FlowExample {
	byRoute := map[string][]RouteAdvertisement{}
	for _, export := range state.Advertisements {
		byRoute[export.RouteID] = append(byRoute[export.RouteID], export)
	}
	kinds := map[string]string{}
	for _, node := range model.Nodes {
		kinds[node.ID] = string(node.Kind)
	}
	seen := map[string]bool{}
	var result []FlowExample
	for _, route := range state.Origins {
		if route.Protocol == "static" {
			continue
		}
		key := fmt.Sprintf("%s/%s/%s/%s/%d/%s/%d", route.OriginKind, kinds[route.OriginID], route.AFI, route.SAFI, route.RouteType, route.IPFamily, route.VPCID)
		if seen[key] || len(byRoute[route.ID]) == 0 {
			continue
		}
		example := completeFlowExample(route, byRoute[route.ID])
		if len(example.Steps) > 0 {
			seen[key] = true
			result = append(result, example)
		}
	}
	sort.SliceStable(result, func(i, j int) bool {
		category := func(route Route) int {
			if route.SAFI == "evpn" {
				return 0
			}
			if route.OriginKind == "customer" {
				return 1
			}
			return 2
		}
		return category(result[i].Route) < category(result[j].Route)
	})
	return result
}

// Keep the prefixes of complete delivery paths. An export to a redundant RS
// whose selected path cannot carry this branch onward is not a delivery example.
func completeFlowExample(route Route, exports []RouteAdvertisement) FlowExample {
	complete := map[string]bool{}
	for _, export := range exports {
		if !isFlowEndDevice(export.ToID) {
			continue
		}
		for length := 2; length <= len(export.PropagationPath); length++ {
			complete[strings.Join(export.PropagationPath[:length], "\x00")] = true
		}
	}
	example := FlowExample{Route: route}
	for _, export := range exports {
		if complete[strings.Join(export.PropagationPath, "\x00")] {
			example.Steps = append(example.Steps, FlowStep{SessionID: export.SessionID, FromID: export.FromID,
				ToID: export.ToID, Wave: len(export.PropagationPath) - 2})
		}
	}
	sort.SliceStable(example.Steps, func(i, j int) bool { return example.Steps[i].Wave < example.Steps[j].Wave })
	return example
}

func isFlowEndDevice(id string) bool {
	return strings.HasPrefix(id, "host-") || strings.HasPrefix(id, "customer-") || strings.HasPrefix(id, "border-")
}
