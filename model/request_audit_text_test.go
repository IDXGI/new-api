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

func TestExtractAggregatedTextFromResponsePayload_DoesNotInsertExtraChunkNewlines(t *testing.T) {
	bodyText := strings.Join([]string{
		`data: {"id":"resp_x","choices":[{"delta":{"content":"Hello"}}]}`,
		"",
		`data: {"id":"resp_x","choices":[{"delta":{"content":", I"}}]}`,
		"",
		`data: {"id":"resp_x","choices":[{"delta":{"content":" am"}}]}`,
		"",
		`data: {"id":"resp_x","choices":[{"delta":{"content":" Cod"}}]}`,
		"",
		`data: {"id":"resp_x","choices":[{"delta":{"content":"ex"}}]}`,
		"",
		`data: {"id":"resp_x","choices":[{"delta":{"content":".\\n\\n"}}]}`,
		"",
		`data: {"id":"resp_x","choices":[{"delta":{"content":"- Model"}}]}`,
	}, "\n")

	rawPayload, err := common.Marshal(map[string]any{
		"body_kind": "event_stream",
		"body_text": bodyText,
	})
	require.NoError(t, err)

	aggregated := ExtractAggregatedTextFromResponsePayload(string(rawPayload))
	require.Equal(t, "Hello, I am Codex.\n\n- Model", aggregated)
}

func TestExtractAggregatedTextFromResponsePayload_RecomputesOverBrokenStoredValue(t *testing.T) {
	bodyText := strings.Join([]string{
		`data: {"id":"resp_x","choices":[{"delta":{"content":"Hello"}}]}`,
		"",
		`data: {"id":"resp_x","choices":[{"delta":{"content":" world"}}]}`,
	}, "\n")

	rawPayload, err := common.Marshal(map[string]any{
		"aggregated_text": "H\n\ne\n\nl\n\nl\n\no",
		"body_kind":       "event_stream",
		"body_text":       bodyText,
	})
	require.NoError(t, err)

	aggregated := ExtractAggregatedTextFromResponsePayload(string(rawPayload))
	require.Equal(t, "Hello world", aggregated)
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

func TestBuildRequestAuditAggregatedTextPreview_TruncatesByRune(t *testing.T) {
	text := strings.Repeat("回答", 200)

	preview := buildRequestAuditAggregatedTextPreview(text)

	require.Equal(t, requestAuditAggregatedTextPreviewRuneLimit+3, len([]rune(preview)))
	require.Equal(t, "...", string([]rune(preview)[requestAuditAggregatedTextPreviewRuneLimit:]))
}

func TestAttachRequestAuditAggregatedTextPreviewStoresBoundedText(t *testing.T) {
	payload := map[string]any{
		"body_kind": "json",
		"body_json": map[string]any{
			"choices": []any{
				map[string]any{
					"message": map[string]any{
						"content": strings.Repeat("answer", 100),
					},
				},
			},
		},
	}

	AttachRequestAuditAggregatedTextPreview(payload)

	preview, ok := payload[RequestAuditAggregatedTextPreviewKey].(string)
	require.True(t, ok)
	require.LessOrEqual(t, len([]rune(preview)), requestAuditAggregatedTextPreviewRuneLimit+3)
}

func TestExtractRequestAuditAggregatedTextPreview_PrefersStoredPreview(t *testing.T) {
	rawPayload, err := common.Marshal(map[string]any{
		RequestAuditAggregatedTextPreviewKey: "stored answer preview",
		"body_kind":                          "event_stream",
		"body_text":                          "data: invalid-json",
	})
	require.NoError(t, err)

	preview := extractRequestAuditAggregatedTextPreview(string(rawPayload))

	require.Equal(t, "stored answer preview", preview)
}
