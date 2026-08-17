package response_rewrite

import "github.com/QuantumNous/new-api/relaykit/types"

type rewriteRule struct {
	modelPaths  []string
	effortPaths []string
}

var rewriteRules = map[types.RelayFormat]rewriteRule{
	types.RelayFormatOpenAI: {
		modelPaths:  []string{"model"},
		effortPaths: []string{"reasoning_effort", "reasoning.effort"},
	},
	types.RelayFormatOpenAIResponses: {
		modelPaths:  []string{"model", "response.model"},
		effortPaths: []string{"reasoning.effort", "response.reasoning.effort"},
	},
	types.RelayFormatOpenAIResponsesCompaction: {
		modelPaths:  []string{"model", "response.model"},
		effortPaths: []string{"reasoning.effort", "response.reasoning.effort"},
	},
	types.RelayFormatClaude: {
		modelPaths: []string{"model", "message.model"},
	},
	types.RelayFormatEmbedding: {
		modelPaths: []string{"model"},
	},
}
