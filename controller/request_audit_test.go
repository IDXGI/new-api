package controller

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildRequestAuditResponseExposesFourWireBoundaries(t *testing.T) {
	audit := &model.RequestAudit{
		RequestPayload:  model.RequestAuditPayload(`{"body_json":{"model":"client-model"}}`),
		ResponsePayload: model.RequestAuditPayload(`{"_aggregated_text_preview":"answer preview","body_json":{"model":"client-model"}}`),
		TracePayload: model.RequestAuditPayload(`{
			"request_conversion":["openai","claude"],
			"upstream_request":{"body_json":{"model":"upstream-model"}},
			"upstream_response":{"body_json":{"model":"upstream-model"}}
		}`),
	}

	response := buildRequestAuditResponse(audit, nil, true)
	clientRequest, ok := response["client_request"].(map[string]any)
	require.True(t, ok)
	upstreamRequest, ok := response["upstream_request"].(map[string]any)
	require.True(t, ok)
	upstreamResponse, ok := response["upstream_response"].(map[string]any)
	require.True(t, ok)
	clientResponse, ok := response["client_response"].(map[string]any)
	require.True(t, ok)
	trace, ok := response["trace"].(map[string]any)
	require.True(t, ok)

	assert.Contains(t, clientRequest, "body_json")
	assert.Contains(t, upstreamRequest, "body_json")
	assert.Contains(t, upstreamResponse, "body_json")
	assert.Contains(t, clientResponse, "body_json")
	assert.NotContains(t, clientResponse, model.RequestAuditAggregatedTextPreviewKey)
	assert.Contains(t, trace, "request_conversion")
	assert.NotContains(t, trace, "upstream_request")
	assert.NotContains(t, trace, "upstream_response")
	assert.Equal(t, response["client_request"], response["request"])
	assert.Equal(t, response["client_response"], response["response"])
}

func TestGetRequestAuditPayloadSelectionKeepsLegacyAndSectionQueriesCompatible(t *testing.T) {
	gin.SetMode(gin.TestMode)
	tests := []struct {
		name       string
		query      string
		expected   requestAuditPayloadSelection
		fields     model.RequestAuditPayloadFields
		expectedOK bool
	}{
		{name: "legacy default loads all", expected: requestAuditPayloadAll, fields: model.RequestAuditAllPayloads, expectedOK: true},
		{name: "overview omits payloads", query: "include_payloads=false", expected: requestAuditPayloadNone, expectedOK: true},
		{name: "answer selects response", query: "payload=answer", expected: requestAuditPayloadAnswer, fields: model.RequestAuditResponsePayload, expectedOK: true},
		{name: "trace selects trace", query: "payload=trace", expected: requestAuditPayloadTrace, fields: model.RequestAuditTracePayload, expectedOK: true},
		{name: "invalid section is rejected", query: "payload=unknown", expected: requestAuditPayloadNone, expectedOK: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest("GET", "/api/request-audit/req?"+tt.query, nil)

			selection, ok := getRequestAuditPayloadSelection(c)

			assert.Equal(t, tt.expectedOK, ok)
			assert.Equal(t, tt.expected, selection)
			assert.Equal(t, tt.fields, selection.modelFields())
		})
	}
}

func TestBuildRequestAuditResponseLoadsOnlySelectedPayloadSection(t *testing.T) {
	preview := "bounded answer preview"
	audit := &model.RequestAudit{
		AggregatedTextPreview: &preview,
		RequestPayload:        model.RequestAuditPayload(`{"body_json":{"model":"client-model"}}`),
		ResponsePayload:       model.RequestAuditPayload(`{"body_json":{"model":"client-model"}}`),
		TracePayload: model.RequestAuditPayload(`{
			"request_conversion":["openai","claude"],
			"upstream_request":{"body_json":{"model":"upstream-model"}},
			"upstream_response":{"body_json":{"model":"upstream-model"}}
		}`),
	}

	response := buildRequestAuditResponseWithSelection(audit, nil, requestAuditPayloadUpstreamRequest)

	assert.Equal(t, "upstream_request", response["payload_section"])
	assert.Equal(t, false, response["payloads_loaded"])
	assert.Equal(t, preview, response["aggregated_text"])
	assert.Contains(t, response, "upstream_request")
	assert.NotContains(t, response, "client_request")
	assert.NotContains(t, response, "upstream_response")
	assert.NotContains(t, response, "client_response")
	assert.NotContains(t, response, "trace")
}

func TestBuildRequestAuditResponseAnswerReturnsFullTextWithoutWirePayload(t *testing.T) {
	preview := "answer preview"
	audit := &model.RequestAudit{
		AggregatedTextPreview: &preview,
		ResponsePayload: model.RequestAuditPayload(`{
			"body_kind":"json",
			"body_json":{"choices":[{"message":{"content":"complete answer content"}}]}
		}`),
	}

	response := buildRequestAuditResponseWithSelection(audit, nil, requestAuditPayloadAnswer)

	assert.Equal(t, "complete answer content", response["aggregated_text"])
	assert.Equal(t, "answer", response["payload_section"])
	assert.NotContains(t, response, "client_response")
	assert.NotContains(t, response, "response")
}

func TestBuildRequestAuditResponseTraceOmitsNestedWirePayloads(t *testing.T) {
	audit := &model.RequestAudit{
		TracePayload: model.RequestAuditPayload(`{
			"request_conversion":["responses","chat"],
			"upstream_request":{"body_json":{"model":"upstream-model"}},
			"upstream_response":{"body_json":{"model":"upstream-model"}}
		}`),
	}

	response := buildRequestAuditResponseWithSelection(audit, nil, requestAuditPayloadTrace)
	trace, ok := response["trace"].(map[string]any)
	require.True(t, ok)

	assert.Contains(t, trace, "request_conversion")
	assert.NotContains(t, trace, "upstream_request")
	assert.NotContains(t, trace, "upstream_response")
	assert.NotContains(t, response, "upstream_request")
	assert.NotContains(t, response, "upstream_response")
}
