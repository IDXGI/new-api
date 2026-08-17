package service

import (
	"bytes"
	"io"
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestGetRequestAuditStateInitializesNilInternals(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(nil)
	c.Set(requestAuditContextKey, &requestAuditState{})

	state := GetRequestAuditState(c)
	require.NotNil(t, state)
	require.NotNil(t, state.Audit)
	require.NotNil(t, state.RequestPayload)
	require.NotNil(t, state.UpstreamRequestPayload)
	require.NotNil(t, state.UpstreamResponsePayload)
	require.NotNil(t, state.ResponsePayload)
	require.NotNil(t, state.TracePayload)
}

func TestCaptureRequestAuditUpstreamRequestStoresFinalWireBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(nil)
	c.Set(requestAuditContextKey, &requestAuditState{Audit: &model.RequestAudit{ModelName: "A"}})
	req, err := http.NewRequest(http.MethodPost, "https://upstream.example/v1/responses", bytes.NewReader([]byte(`{"model":"C","reasoning":{"effort":"max"}}`)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer secret-value")

	CaptureRequestAuditUpstreamRequest(c, req)

	state := GetRequestAuditState(c)
	require.Equal(t, "C", state.Audit.UpstreamModelName)
	require.Equal(t, "json", state.UpstreamRequestPayload["body_kind"])
	bodyJSON, ok := state.UpstreamRequestPayload["body_json"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, "C", bodyJSON["model"])
	headers, ok := state.UpstreamRequestPayload["headers"].(map[string]string)
	require.True(t, ok)
	require.NotEqual(t, "Bearer secret-value", headers["Authorization"])
}

func TestCaptureRequestAuditUpstreamResponseKeepsRawPayloadBeforeClientRewrite(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(nil)
	state := &requestAuditState{Audit: &model.RequestAudit{}}
	c.Set(requestAuditContextKey, state)
	resp := &http.Response{
		StatusCode:    http.StatusOK,
		Status:        "200 OK",
		Header:        http.Header{"Content-Type": []string{"application/json"}},
		Body:          io.NopCloser(bytes.NewReader([]byte(`{"model":"upstream-model"}`))),
		ContentLength: int64(len(`{"model":"upstream-model"}`)),
	}

	CaptureRequestAuditUpstreamResponse(c, resp)
	readBody, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Equal(t, `{"model":"upstream-model"}`, string(readBody))
	finalizeRequestAuditUpstreamResponse(GetRequestAuditState(c))

	bodyJSON, ok := GetRequestAuditState(c).UpstreamResponsePayload["body_json"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, "upstream-model", bodyJSON["model"])
}

func TestCaptureRequestAuditRelayInfoWithMinimalStateDoesNotPanic(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(nil)
	c.Set(requestAuditContextKey, &requestAuditState{
		Audit: &model.RequestAudit{},
	})

	require.NotPanics(t, func() {
		CaptureRequestAuditRelayInfo(c, &relaycommon.RelayInfo{
			RelayFormat:     types.RelayFormatOpenAI,
			OriginModelName: "deepseek-chat",
			ChannelMeta: &relaycommon.ChannelMeta{
				UpstreamModelName: "deepseek-chat",
			},
		})
	})

	state := GetRequestAuditState(c)
	require.Equal(t, "deepseek-chat", state.Audit.UpstreamModelName)
	require.Equal(t, "deepseek-chat", state.Audit.ModelName)
}

func TestCaptureRequestAuditRelayInfoWithoutChannelMetaDoesNotPanic(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(nil)
	c.Set(requestAuditContextKey, &requestAuditState{
		Audit: &model.RequestAudit{},
	})

	require.NotPanics(t, func() {
		CaptureRequestAuditRelayInfo(c, &relaycommon.RelayInfo{
			RelayFormat:     types.RelayFormatOpenAI,
			OriginModelName: "deepseek-chat",
		})
	})

	state := GetRequestAuditState(c)
	require.Equal(t, "", state.Audit.UpstreamModelName)
	require.Equal(t, "deepseek-chat", state.Audit.ModelName)
}

func TestCaptureRequestAuditRelayInfoKeepsWirePayloadsSerializable(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(nil)
	c.Set(requestAuditContextKey, &requestAuditState{Audit: &model.RequestAudit{}})

	info := &relaycommon.RelayInfo{
		RelayFormat:     types.RelayFormatOpenAI,
		OriginModelName: "client-model",
	}
	info.PriceData.AddOtherRatio("duration", 2)
	CaptureRequestAuditRelayInfo(c, info)

	state := GetRequestAuditState(c)
	state.TracePayload["upstream_request"] = map[string]any{
		"body_json": map[string]any{"model": "upstream-model"},
	}
	state.TracePayload["upstream_response"] = map[string]any{
		"body_json": map[string]any{"model": "upstream-model"},
	}

	raw := marshalAuditPart(state.TracePayload)
	require.NotEmpty(t, raw)

	var trace map[string]any
	require.NoError(t, common.Unmarshal([]byte(raw), &trace))
	require.Contains(t, trace, "upstream_request")
	require.Contains(t, trace, "upstream_response")
	billing, ok := trace["billing"].(map[string]any)
	require.True(t, ok)
	otherRatios, ok := billing["other_ratios"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, float64(2), otherRatios["duration"])
}

func TestSyncRequestAuditRelayInfoCapturesMappedModel(t *testing.T) {
	state := &requestAuditState{
		Audit: &model.RequestAudit{
			ModelName: "alias-model",
		},
		ResponsePayload: map[string]any{},
		TracePayload:    map[string]any{},
		RelayInfo: &relaycommon.RelayInfo{
			OriginModelName: "alias-model",
			ChannelMeta: &relaycommon.ChannelMeta{
				UpstreamModelName: "real-upstream-model",
				IsModelMapped:     true,
			},
		},
	}

	syncRequestAuditRelayInfo(state)

	require.Equal(t, "real-upstream-model", state.Audit.UpstreamModelName)
	modelResolution, ok := state.TracePayload["model_resolution"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, "alias-model", modelResolution["requested_model"])
	require.Equal(t, "real-upstream-model", modelResolution["upstream_model"])
	require.Equal(t, true, modelResolution["is_model_mapped"])
}

func TestSyncRequestAuditRelayInfoFallsBackToLinkedLogMapping(t *testing.T) {
	state := &requestAuditState{
		Audit: &model.RequestAudit{
			ModelName: "dsr",
		},
		ResponsePayload: map[string]any{},
		TracePayload:    map[string]any{},
		RelayInfo: &relaycommon.RelayInfo{
			OriginModelName: "dsr",
		},
	}

	applyRequestAuditMetadataFromLinkedLog(state, &model.Log{
		ModelName: "dsr",
	}, map[string]any{
		"upstream_model_name": "deepseek-reasoner",
		"is_model_mapped":     true,
	})
	syncRequestAuditRelayInfo(state)

	require.Equal(t, "deepseek-reasoner", state.Audit.UpstreamModelName)
	modelResolution, ok := state.TracePayload["model_resolution"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, "dsr", modelResolution["requested_model"])
	require.Equal(t, "deepseek-reasoner", modelResolution["upstream_model"])
	require.Equal(t, true, modelResolution["is_model_mapped"])
}
