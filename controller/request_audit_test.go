package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/model"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildRequestAuditResponseExposesFourWireBoundaries(t *testing.T) {
	audit := &model.RequestAudit{
		RequestPayload:  model.RequestAuditPayload(`{"body_json":{"model":"client-model"}}`),
		ResponsePayload: model.RequestAuditPayload(`{"body_json":{"model":"client-model"}}`),
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
	assert.Contains(t, trace, "request_conversion")
	assert.NotContains(t, trace, "upstream_request")
	assert.NotContains(t, trace, "upstream_response")
	assert.Equal(t, response["client_request"], response["request"])
	assert.Equal(t, response["client_response"], response["response"])
}
