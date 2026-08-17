package response_rewrite

import (
	"strings"

	kitreasoning "github.com/QuantumNous/new-api/relaykit/relayconvert/reasoning"
	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

const clientResponseIdentityContextKey = "response_rewrite_client_identity"

type ClientResponseIdentity struct {
	RelayFormat       types.RelayFormat
	Model             string
	Effort            string
	HasExplicitEffort bool
}

func CaptureClientRequest(c *gin.Context, relayFormat types.RelayFormat, body []byte) bool {
	if c == nil {
		return false
	}
	if _, exists := c.Get(clientResponseIdentityContextKey); exists {
		_, ok := GetClientResponseIdentity(c)
		return ok
	}
	if len(body) == 0 || !gjson.ValidBytes(body) {
		return false
	}

	modelValue := gjson.GetBytes(body, "model")
	if modelValue.Type != gjson.String {
		return false
	}
	model := strings.TrimSpace(modelValue.String())
	if model == "" {
		return false
	}

	effort, hasExplicitEffort := clientEffort(relayFormat, body, model)
	c.Set(clientResponseIdentityContextKey, ClientResponseIdentity{
		RelayFormat:       relayFormat,
		Model:             model,
		Effort:            effort,
		HasExplicitEffort: hasExplicitEffort,
	})
	return true
}

func GetClientResponseIdentity(c *gin.Context) (ClientResponseIdentity, bool) {
	if c == nil {
		return ClientResponseIdentity{}, false
	}
	value, exists := c.Get(clientResponseIdentityContextKey)
	if !exists {
		return ClientResponseIdentity{}, false
	}
	identity, ok := value.(ClientResponseIdentity)
	if !ok || identity.Model == "" {
		return ClientResponseIdentity{}, false
	}
	return identity, true
}

func clientEffort(relayFormat types.RelayFormat, body []byte, model string) (string, bool) {
	var paths []string
	switch relayFormat {
	case types.RelayFormatOpenAI:
		paths = []string{"reasoning_effort", "reasoning.effort"}
	case types.RelayFormatOpenAIResponses, types.RelayFormatOpenAIResponsesCompaction:
		paths = []string{"reasoning.effort"}
	case types.RelayFormatClaude:
		paths = []string{"output_config.effort"}
	}

	for _, path := range paths {
		value := gjson.GetBytes(body, path)
		if value.Type != gjson.String {
			continue
		}
		effort := strings.TrimSpace(value.String())
		if effort != "" {
			return effort, true
		}
	}

	switch relayFormat {
	case types.RelayFormatOpenAI, types.RelayFormatOpenAIResponses, types.RelayFormatOpenAIResponsesCompaction:
		effort, _ := kitreasoning.ParseOpenAIReasoningEffortFromModelSuffix(model)
		if effort != "" {
			return effort, true
		}
	case types.RelayFormatClaude:
		_, effort, ok := kitreasoning.TrimEffortSuffix(model)
		if ok && effort != "" {
			return effort, true
		}
	}

	return "", false
}
