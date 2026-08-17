package response_rewrite

import (
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestRewriteJSONRestoresClientIdentityAfterGatewayMutations(t *testing.T) {
	tests := []struct {
		name           string
		clientRequest  string
		upstreamResult string
		wantModel      string
		wantEffort     string
	}{
		{
			name:           "model mapping",
			clientRequest:  `{"model":"A"}`,
			upstreamResult: `{"model":"B"}`,
			wantModel:      "A",
		},
		{
			name:           "model mapping followed by param override",
			clientRequest:  `{"model":"A"}`,
			upstreamResult: `{"model":"C"}`,
			wantModel:      "A",
		},
		{
			name:           "effort param override",
			clientRequest:  `{"model":"A","reasoning":{"effort":"low"}}`,
			upstreamResult: `{"model":"A","reasoning":{"effort":"high"}}`,
			wantModel:      "A",
			wantEffort:     "low",
		},
		{
			name:           "mapping and model plus effort overrides",
			clientRequest:  `{"model":"A","reasoning":{"effort":"low"}}`,
			upstreamResult: `{"model":"C","reasoning":{"effort":"max"}}`,
			wantModel:      "A",
			wantEffort:     "low",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			context := newIdentityContext(t, types.RelayFormatOpenAI, test.clientRequest)
			rewritten, err := RewriteJSON(context, []byte(test.upstreamResult))
			require.NoError(t, err)
			assert.Equal(t, test.wantModel, gjson.GetBytes(rewritten, "model").String())
			if test.wantEffort != "" {
				assert.Equal(t, test.wantEffort, gjson.GetBytes(rewritten, "reasoning.effort").String())
			}
		})
	}
}

func TestRewriteJSONKeepsUpstreamEffortWhenClientDidNotSpecifyIt(t *testing.T) {
	context := newIdentityContext(t, types.RelayFormatOpenAIResponses, `{"model":"A","input":"hello"}`)
	rewritten, err := RewriteJSON(context, []byte(`{"model":"B","reasoning":{"effort":"high"}}`))
	require.NoError(t, err)
	assert.Equal(t, "A", gjson.GetBytes(rewritten, "model").String())
	assert.Equal(t, "high", gjson.GetBytes(rewritten, "reasoning.effort").String())
}

func TestRewriteJSONRestoresResponsesNonStreamIdentity(t *testing.T) {
	context := newIdentityContext(t, types.RelayFormatOpenAIResponses, `{"model":"A","reasoning":{"effort":"low"}}`)
	upstream := []byte(`{"model":"C","reasoning":{"effort":"max"},"output":[]}`)
	rewritten, err := RewriteJSON(context, upstream)
	require.NoError(t, err)
	assert.Equal(t, "A", gjson.GetBytes(rewritten, "model").String())
	assert.Equal(t, "low", gjson.GetBytes(rewritten, "reasoning.effort").String())
	assert.Equal(t, "C", gjson.GetBytes(upstream, "model").String())
	assert.Equal(t, "max", gjson.GetBytes(upstream, "reasoning.effort").String())
}

func TestRewriteJSONRestoresExistingChatReasoningEffortField(t *testing.T) {
	context := newIdentityContext(t, types.RelayFormatOpenAI, `{"model":"A","reasoning_effort":"low"}`)
	rewritten, err := RewriteJSON(context, []byte(`{"model":"B","reasoning_effort":"high"}`))
	require.NoError(t, err)
	assert.Equal(t, "A", gjson.GetBytes(rewritten, "model").String())
	assert.Equal(t, "low", gjson.GetBytes(rewritten, "reasoning_effort").String())
}

func TestRewriteJSONDoesNotCreateMissingEffortFields(t *testing.T) {
	context := newIdentityContext(t, types.RelayFormatOpenAIResponses, `{"model":"A","reasoning":{"effort":"low"}}`)
	rewritten, err := RewriteJSON(context, []byte(`{"model":"B"}`))
	require.NoError(t, err)
	assert.Equal(t, "A", gjson.GetBytes(rewritten, "model").String())
	assert.False(t, gjson.GetBytes(rewritten, "reasoning.effort").Exists())
}

func TestCaptureClientRequestUsesSupportedExplicitEffortFormsAndSuffixes(t *testing.T) {
	tests := []struct {
		name          string
		format        types.RelayFormat
		request       string
		wantModel     string
		wantEffort    string
		wantHasEffort bool
	}{
		{
			name:          "chat reasoning effort",
			format:        types.RelayFormatOpenAI,
			request:       `{"model":"gpt-5","reasoning_effort":"high"}`,
			wantModel:     "gpt-5",
			wantEffort:    "high",
			wantHasEffort: true,
		},
		{
			name:          "chat reasoning object",
			format:        types.RelayFormatOpenAI,
			request:       `{"model":"gpt-5","reasoning":{"effort":"medium"}}`,
			wantModel:     "gpt-5",
			wantEffort:    "medium",
			wantHasEffort: true,
		},
		{
			name:          "responses reasoning object",
			format:        types.RelayFormatOpenAIResponses,
			request:       `{"model":"gpt-5","reasoning":{"effort":"low"}}`,
			wantModel:     "gpt-5",
			wantEffort:    "low",
			wantHasEffort: true,
		},
		{
			name:          "claude output config",
			format:        types.RelayFormatClaude,
			request:       `{"model":"claude-opus-4-6","output_config":{"effort":"max"}}`,
			wantModel:     "claude-opus-4-6",
			wantEffort:    "max",
			wantHasEffort: true,
		},
		{
			name:          "openai suffix",
			format:        types.RelayFormatOpenAIResponses,
			request:       `{"model":"gpt-5-high"}`,
			wantModel:     "gpt-5-high",
			wantEffort:    "high",
			wantHasEffort: true,
		},
		{
			name:          "thinking suffix has no explicit strength",
			format:        types.RelayFormatClaude,
			request:       `{"model":"claude-sonnet-4-thinking"}`,
			wantModel:     "claude-sonnet-4-thinking",
			wantHasEffort: false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			context := newIdentityContext(t, test.format, test.request)
			identity, ok := GetClientResponseIdentity(context)
			require.True(t, ok)
			assert.Equal(t, test.wantModel, identity.Model)
			assert.Equal(t, test.wantEffort, identity.Effort)
			assert.Equal(t, test.wantHasEffort, identity.HasExplicitEffort)
		})
	}
}

func TestCaptureClientRequestDoesNotOverwriteTheFirstSnapshot(t *testing.T) {
	context := newIdentityContext(t, types.RelayFormatOpenAIResponses, `{"model":"A","reasoning":{"effort":"low"}}`)
	require.True(t, CaptureClientRequest(context, types.RelayFormatClaude, []byte(`{"model":"B","output_config":{"effort":"max"}}`)))
	identity, ok := GetClientResponseIdentity(context)
	require.True(t, ok)
	assert.Equal(t, types.RelayFormat(types.RelayFormatOpenAIResponses), identity.RelayFormat)
	assert.Equal(t, "A", identity.Model)
	assert.Equal(t, "low", identity.Effort)
}

func TestResponseWriterRewritesEveryOpenAIChatSSEChunk(t *testing.T) {
	context, recorder := newWrappedContext(t, types.RelayFormatOpenAI, `{"model":"A"}`)
	context.Header("Content-Type", "text/event-stream")
	stream := strings.Join([]string{
		`data: {"object":"chat.completion.chunk","model":"B","choices":[{"delta":{"content":"one"}}]}`,
		`data: {"object":"chat.completion.chunk","model":"B","choices":[{"finish_reason":"stop"}]}`,
		`data: {"object":"chat.completion.chunk","model":"B","choices":[],"usage":{"total_tokens":3}}`,
		`data: [DONE]`,
		"",
	}, "\n\n")

	_, err := context.Writer.WriteString(stream)
	require.NoError(t, err)
	lines := responseDataLines(recorder.Body.String())
	require.Len(t, lines, 4)
	for _, line := range lines[:3] {
		assert.Equal(t, "A", gjson.Get(line, "model").String())
	}
	assert.Equal(t, "[DONE]", lines[3])
}

func TestResponseWriterRewritesResponsesSSEEventsAndEffort(t *testing.T) {
	context, recorder := newWrappedContext(t, types.RelayFormatOpenAIResponses, `{"model":"A","reasoning":{"effort":"low"}}`)
	context.Header("Content-Type", "text/event-stream")
	stream := strings.Join([]string{
		`data: {"type":"response.created","response":{"model":"B","reasoning":{"effort":"high"}}}`,
		`data: {"type":"response.in_progress","response":{"model":"B","reasoning":{"effort":"high"}}}`,
		`data: {"type":"response.completed","response":{"model":"B","reasoning":{"effort":"high"}}}`,
		"",
	}, "\n\n")

	_, err := context.Writer.WriteString(stream)
	require.NoError(t, err)
	for _, line := range responseDataLines(recorder.Body.String()) {
		assert.Equal(t, "A", gjson.Get(line, "response.model").String())
		assert.Equal(t, "low", gjson.Get(line, "response.reasoning.effort").String())
	}
}

func TestResponseWriterRewritesClaudeMessageStart(t *testing.T) {
	context, recorder := newWrappedContext(t, types.RelayFormatClaude, `{"model":"claude-public"}`)
	context.Header("Content-Type", "text/event-stream")
	_, err := context.Writer.WriteString("data: {\"type\":\"message_start\",\"message\":{\"model\":\"upstream-claude\"}}\n\n")
	require.NoError(t, err)
	lines := responseDataLines(recorder.Body.String())
	require.Len(t, lines, 1)
	assert.Equal(t, "claude-public", gjson.Get(lines[0], "message.model").String())
}

func TestRewriteUsesClientRelayFormatAcrossProtocolConversions(t *testing.T) {
	t.Run("Claude upstream to OpenAI client", func(t *testing.T) {
		context := newIdentityContext(t, types.RelayFormatOpenAI, `{"model":"openai-public"}`)
		rewritten, err := RewriteJSON(context, []byte(`{"model":"converted-from-claude"}`))
		require.NoError(t, err)
		assert.Equal(t, "openai-public", gjson.GetBytes(rewritten, "model").String())
	})

	t.Run("OpenAI upstream to Claude client", func(t *testing.T) {
		context := newIdentityContext(t, types.RelayFormatClaude, `{"model":"claude-public"}`)
		rewritten, err := RewriteJSON(context, []byte(`{"type":"message","model":"converted-from-openai"}`))
		require.NoError(t, err)
		assert.Equal(t, "claude-public", gjson.GetBytes(rewritten, "model").String())
	})
}

func TestRewriteJSONFailsOpenForUnsupportedPayloads(t *testing.T) {
	context := newIdentityContext(t, types.RelayFormatOpenAI, `{"model":"A"}`)
	for _, payload := range []string{"", "[DONE]", "not-json", `{"metadata":{"model":"nested"}}`} {
		rewritten, err := RewriteJSON(context, []byte(payload))
		require.NoError(t, err)
		assert.Equal(t, payload, string(rewritten))
	}
}

func TestResponseWriterUpdatesExistingContentLength(t *testing.T) {
	context, recorder := newWrappedContext(t, types.RelayFormatOpenAI, `{"model":"client-model"}`)
	payload := `{"model":"x"}`
	context.Header("Content-Type", "application/json")
	context.Header("Content-Length", strconv.Itoa(len(payload)))

	_, err := context.Writer.Write([]byte(payload))
	require.NoError(t, err)
	assert.Equal(t, "client-model", gjson.Get(recorder.Body.String(), "model").String())
	assert.Equal(t, strconv.Itoa(recorder.Body.Len()), recorder.Header().Get("Content-Length"))
}

func newIdentityContext(t *testing.T, relayFormat types.RelayFormat, request string) *gin.Context {
	t.Helper()
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	require.True(t, CaptureClientRequest(context, relayFormat, []byte(request)))
	return context
}

func newWrappedContext(t *testing.T, relayFormat types.RelayFormat, request string) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	require.True(t, CaptureClientRequest(context, relayFormat, []byte(request)))
	WrapResponseWriter(context)
	return context, recorder
}

func responseDataLines(stream string) []string {
	lines := strings.Split(stream, "\n")
	result := make([]string, 0, len(lines))
	for _, line := range lines {
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		result = append(result, strings.TrimSpace(strings.TrimPrefix(line, "data:")))
	}
	return result
}
