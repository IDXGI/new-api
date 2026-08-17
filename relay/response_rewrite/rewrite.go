package response_rewrite

import (
	"bytes"

	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

var donePayload = []byte("[DONE]")

func RewriteJSON(c *gin.Context, data []byte) ([]byte, error) {
	identity, ok := GetClientResponseIdentity(c)
	if !ok {
		return data, nil
	}
	return rewriteJSON(identity, data)
}

func rewriteJSON(identity ClientResponseIdentity, data []byte) ([]byte, error) {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 || bytes.Equal(trimmed, donePayload) || !gjson.ValidBytes(trimmed) {
		return data, nil
	}

	rule, ok := rewriteRules[identity.RelayFormat]
	if !ok {
		return data, nil
	}

	rewritten := data
	var err error
	for _, path := range rule.modelPaths {
		value := gjson.GetBytes(rewritten, path)
		if value.Type != gjson.String {
			continue
		}
		rewritten, err = sjson.SetBytes(rewritten, path, identity.Model)
		if err != nil {
			return data, err
		}
	}

	if !identity.HasExplicitEffort {
		return rewritten, nil
	}
	for _, path := range rule.effortPaths {
		value := gjson.GetBytes(rewritten, path)
		if value.Type != gjson.String {
			continue
		}
		rewritten, err = sjson.SetBytes(rewritten, path, identity.Effort)
		if err != nil {
			return data, err
		}
	}
	return rewritten, nil
}
