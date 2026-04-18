package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
)

type auditTextMode int

const (
	auditTextModeSnapshot auditTextMode = iota
	auditTextModeFragment
)

var auditTextContainerKeys = []string{
	"choices",
	"choice",
	"candidate",
	"candidates",
	"message",
	"content",
	"contents",
	"part",
	"parts",
	"output",
	"outputs",
	"item",
	"items",
	"response",
	"responses",
	"result",
	"results",
	"error",
	"errors",
	"data",
	"delta",
	"deltas",
	"tool_call",
	"tool_calls",
	"function_call",
	"function_calls",
	"call",
	"calls",
	"chunk",
	"chunks",
	"segment",
	"segments",
	"block",
	"blocks",
}

var auditTextPrimaryKeys = []string{
	"aggregated_text",
	"output_text",
	"text",
	"reasoning_content",
	"reasoning",
	"summary",
	"transcript",
	"code",
	"value",
	"description",
}

var auditTextFallbackKeys = []string{
	"arguments",
	"argument",
	"input",
}

var auditTextIgnoredKeys = map[string]struct{}{
	"body_kind":         {},
	"body_text":         {},
	"body_json":         {},
	"headers":           {},
	"header":            {},
	"id":                {},
	"ids":               {},
	"object":            {},
	"type":              {},
	"status":            {},
	"role":              {},
	"event":             {},
	"index":             {},
	"indices":           {},
	"sequence_number":   {},
	"output_index":      {},
	"item_id":           {},
	"call_id":           {},
	"created_at":        {},
	"completed_at":      {},
	"encrypted_content": {},
	"obfuscation":       {},
	"instructions":      {},
	"prompt":            {},
	"tools":             {},
	"tool_choice":       {},
	"format":            {},
	"schema":            {},
	"properties":        {},
	"parameters":        {},
	"usage":             {},
}

var auditTextFragmentKeys = map[string]struct{}{
	"delta":         {},
	"deltas":        {},
	"text_delta":    {},
	"content_delta": {},
	"partial_text":  {},
}

var auditTextDirectStringKeys = map[string]struct{}{
	"aggregated_text":   {},
	"output_text":       {},
	"text":              {},
	"reasoning_content": {},
	"reasoning":         {},
	"summary":           {},
	"transcript":        {},
	"code":              {},
	"value":             {},
	"description":       {},
	"arguments":         {},
	"argument":          {},
	"input":             {},
	"message":           {},
	"content":           {},
	"contents":          {},
	"output":            {},
	"outputs":           {},
}

func ExtractAggregatedTextFromAuditPayload(payload map[string]any) string {
	if len(payload) == 0 {
		return ""
	}
	if aggregated := normalizeAuditTextValue(common.Interface2String(payload["aggregated_text"]), auditTextModeSnapshot); aggregated != "" {
		return aggregated
	}
	if bodyJSON, ok := payload["body_json"]; ok {
		if text := extractRepresentativeAuditText(bodyJSON, auditTextModeSnapshot); text != "" {
			return text
		}
		if text := extractRepresentativeAuditText(bodyJSON, auditTextModeFragment); text != "" {
			return text
		}
	}
	bodyText := common.Interface2String(payload["body_text"])
	if bodyText == "" {
		return ""
	}
	switch strings.ToLower(strings.TrimSpace(common.Interface2String(payload["body_kind"]))) {
	case "event_stream":
		if text := extractAuditTextFromEventStream(bodyText, auditTextModeSnapshot); text != "" {
			return text
		}
		if text := extractAuditTextFromEventStream(bodyText, auditTextModeFragment); text != "" {
			return text
		}
		return ""
	case "json":
		var body any
		if common.Unmarshal([]byte(bodyText), &body) == nil {
			if text := extractRepresentativeAuditText(body, auditTextModeSnapshot); text != "" {
				return text
			}
			if text := extractRepresentativeAuditText(body, auditTextModeFragment); text != "" {
				return text
			}
		}
		return ""
	case "text", "":
		return normalizeAuditTextValue(bodyText, auditTextModeSnapshot)
	default:
		return normalizeAuditTextValue(bodyText, auditTextModeSnapshot)
	}
}

func extractAuditTextFromEventStream(bodyText string, mode auditTextMode) string {
	lines := strings.Split(bodyText, "\n")
	parts := make([]string, 0)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" || payload == "[DONE]" {
			continue
		}
		var item any
		if common.Unmarshal([]byte(payload), &item) != nil {
			continue
		}
		if text := extractRepresentativeAuditText(item, mode); text != "" {
			parts = append(parts, text)
		}
	}
	if mode == auditTextModeFragment {
		return joinAuditTextParts(parts, "", false)
	}
	return joinAuditTextParts(parts, "\n\n", true)
}

func extractRepresentativeAuditText(value any, mode auditTextMode) string {
	switch item := value.(type) {
	case map[string]any:
		return extractAuditTextFromMap(item, mode)
	case []any:
		parts := make([]string, 0, len(item))
		for _, subItem := range item {
			if text := extractRepresentativeAuditText(subItem, mode); text != "" {
				parts = append(parts, text)
			}
		}
		if mode == auditTextModeFragment {
			return joinAuditTextParts(parts, "", false)
		}
		return joinAuditTextParts(parts, "\n", true)
	case string:
		return normalizeAuditTextValue(item, mode)
	default:
		return ""
	}
}

func extractAuditTextFromMap(item map[string]any, mode auditTextMode) string {
	processed := make(map[string]struct{})
	if text := collectAuditTextFromKeys(item, auditTextContainerKeys, mode, processed); text != "" {
		return text
	}
	if text := collectAuditTextFromKeys(item, auditTextPrimaryKeys, mode, processed); text != "" {
		return text
	}
	if text := collectAuditTextFromKeys(item, auditTextFallbackKeys, mode, processed); text != "" {
		return text
	}
	return ""
}

func collectAuditTextFromKeys(item map[string]any, keys []string, mode auditTextMode, processed map[string]struct{}) string {
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		if _, ok := processed[key]; ok {
			continue
		}
		value, exists := item[key]
		if !exists {
			continue
		}
		processed[key] = struct{}{}
		if text := extractAuditTextFromField(key, value, mode); text != "" {
			parts = append(parts, text)
		}
	}
	if mode == auditTextModeFragment {
		return joinAuditTextParts(parts, "", false)
	}
	return joinAuditTextParts(parts, "\n", true)
}

func extractAuditTextFromField(key string, value any, mode auditTextMode) string {
	normalizedKey := strings.ToLower(strings.TrimSpace(key))
	if _, ok := auditTextIgnoredKeys[normalizedKey]; ok {
		return ""
	}
	if _, ok := auditTextFragmentKeys[normalizedKey]; ok && mode != auditTextModeFragment {
		return extractAuditCompositeText(value, mode)
	}
	if _, ok := auditTextDirectStringKeys[normalizedKey]; ok {
		return extractAuditDirectText(value, mode)
	}
	return extractAuditCompositeText(value, mode)
}

func extractAuditDirectText(value any, mode auditTextMode) string {
	switch item := value.(type) {
	case string:
		if parsed := parseEmbeddedAuditJSON(item); parsed != nil {
			if text := extractRepresentativeAuditText(parsed, mode); text != "" {
				return text
			}
		}
		return normalizeAuditTextValue(item, mode)
	case []any, map[string]any:
		return extractRepresentativeAuditText(value, mode)
	default:
		return ""
	}
}

func extractAuditCompositeText(value any, mode auditTextMode) string {
	switch item := value.(type) {
	case map[string]any:
		return extractAuditTextFromMap(item, mode)
	case []any:
		parts := make([]string, 0, len(item))
		for _, subItem := range item {
			if text := extractRepresentativeAuditText(subItem, mode); text != "" {
				parts = append(parts, text)
			}
		}
		if mode == auditTextModeFragment {
			return joinAuditTextParts(parts, "", false)
		}
		return joinAuditTextParts(parts, "\n", true)
	default:
		return ""
	}
}

func parseEmbeddedAuditJSON(raw string) any {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	if !strings.HasPrefix(raw, "{") && !strings.HasPrefix(raw, "[") {
		return nil
	}
	var value any
	if common.Unmarshal([]byte(raw), &value) != nil {
		return nil
	}
	return value
}

func normalizeAuditTextValue(value string, mode auditTextMode) string {
	if value == "" {
		return ""
	}
	if mode == auditTextModeFragment {
		if value == "[DONE]" {
			return ""
		}
		return value
	}
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || trimmed == "[DONE]" {
		return ""
	}
	return trimmed
}

func joinAuditTextParts(parts []string, separator string, dedupe bool) string {
	if len(parts) == 0 {
		return ""
	}
	result := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, part := range parts {
		if part == "" {
			continue
		}
		if dedupe {
			if _, ok := seen[part]; ok {
				continue
			}
			seen[part] = struct{}{}
		}
		result = append(result, part)
	}
	return strings.TrimSpace(strings.Join(result, separator))
}
