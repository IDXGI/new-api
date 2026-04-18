package model

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestExtractAggregatedTextFromResponsePayload_PrefersCompletedEventContent(t *testing.T) {
	bodyText := strings.Join([]string{
		"event: response.created",
		`data: {"response":{"instructions":"request-side prompt","tools":[{"name":"apply_patch","description":"tool schema"}],"output":[]}}`,
		"",
		"event: response.custom_tool_call_input.delta",
		`data: {"delta":"*** Begin Patch\n"}`,
		"",
		"event: response.custom_tool_call_input.done",
		`data: {"input":"*** Begin Patch\n*** Update File: demo.txt\n*** End Patch\n"}`,
		"",
		"event: response.output_item.done",
		`data: {"item":{"type":"custom_tool_call","name":"apply_patch","input":"*** Begin Patch\n*** Update File: demo.txt\n*** End Patch\n"}}`,
	}, "\n")

	rawPayload, err := common.Marshal(map[string]any{
		"body_kind": "event_stream",
		"body_text": bodyText,
	})
	require.NoError(t, err)

	aggregated := ExtractAggregatedTextFromResponsePayload(string(rawPayload))
	require.Equal(t, "*** Begin Patch\n*** Update File: demo.txt\n*** End Patch", aggregated)
}

func TestExtractAggregatedTextFromResponsePayload_FallsBackToDeltaFragments(t *testing.T) {
	bodyText := strings.Join([]string{
		"event: response.output_text.delta",
		`data: {"delta":"Hel"}`,
		"",
		"event: response.output_text.delta",
		`data: {"delta":"lo"}`,
	}, "\n")

	rawPayload, err := common.Marshal(map[string]any{
		"body_kind": "event_stream",
		"body_text": bodyText,
	})
	require.NoError(t, err)

	aggregated := ExtractAggregatedTextFromResponsePayload(string(rawPayload))
	require.Equal(t, "Hello", aggregated)
}

func TestExtractAggregatedTextFromAuditPayload_FallsBackToStructuredJSONContent(t *testing.T) {
	aggregated := ExtractAggregatedTextFromAuditPayload(map[string]any{
		"body_kind": "json",
		"body_json": map[string]any{
			"item": map[string]any{
				"type":  "custom_tool_call",
				"name":  "apply_patch",
				"input": "*** Begin Patch\n*** Add File: demo.txt\n*** End Patch\n",
			},
		},
	})

	require.Equal(t, "*** Begin Patch\n*** Add File: demo.txt\n*** End Patch", aggregated)
}
