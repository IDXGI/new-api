package controller

import (
	"errors"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type requestAuditPayloadSelection string

const (
	requestAuditPayloadNone             requestAuditPayloadSelection = ""
	requestAuditPayloadAll              requestAuditPayloadSelection = "all"
	requestAuditPayloadAnswer           requestAuditPayloadSelection = "answer"
	requestAuditPayloadTrace            requestAuditPayloadSelection = "trace"
	requestAuditPayloadClientRequest    requestAuditPayloadSelection = "client_request"
	requestAuditPayloadUpstreamRequest  requestAuditPayloadSelection = "upstream_request"
	requestAuditPayloadUpstreamResponse requestAuditPayloadSelection = "upstream_response"
	requestAuditPayloadClientResponse   requestAuditPayloadSelection = "client_response"
)

func GetRequestAuditByRequestID(c *gin.Context) {
	if !ensureRequestAuditAdmin(c) {
		return
	}
	selection, ok := getRequestAuditPayloadSelection(c)
	if !ok {
		return
	}
	audit, err := model.GetRequestAuditOverviewByRequestID(c.Param("request_id"))
	if err == nil {
		err = loadRequestAuditPayloadSelection(audit, selection)
	}
	respondRequestAudit(c, audit, nil, err, selection)
}

func GetRequestAuditByTaskID(c *gin.Context) {
	if !ensureRequestAuditAdmin(c) {
		return
	}
	selection, ok := getRequestAuditPayloadSelection(c)
	if !ok {
		return
	}
	taskID := c.Param("task_id")
	audit, err := model.GetPreferredRequestAuditByTaskID(taskID)
	if err != nil {
		respondRequestAudit(c, audit, nil, err, selection)
		return
	}
	if err = loadRequestAuditPayloadSelection(audit, selection); err != nil {
		respondRequestAudit(c, audit, nil, err, selection)
		return
	}
	related, relatedErr := model.ListRequestAuditsByTaskID(taskID, 10)
	respondRequestAudit(c, audit, related, relatedErr, selection)
}

func GetRequestAuditByMJID(c *gin.Context) {
	if !ensureRequestAuditAdmin(c) {
		return
	}
	selection, ok := getRequestAuditPayloadSelection(c)
	if !ok {
		return
	}
	mjID := c.Param("mj_id")
	audit, err := model.GetPreferredRequestAuditByMJID(mjID)
	if err != nil {
		respondRequestAudit(c, audit, nil, err, selection)
		return
	}
	if err = loadRequestAuditPayloadSelection(audit, selection); err != nil {
		respondRequestAudit(c, audit, nil, err, selection)
		return
	}
	related, relatedErr := model.ListRequestAuditsByMJID(mjID, 10)
	respondRequestAudit(c, audit, related, relatedErr, selection)
}

func ensureRequestAuditAdmin(c *gin.Context) bool {
	if c.GetInt("role") >= common.RoleAdminUser {
		return true
	}
	c.JSON(http.StatusForbidden, gin.H{
		"success": false,
		"message": "仅管理员可查看该请求审计记录",
	})
	return false
}

func respondRequestAudit(c *gin.Context, audit *model.RequestAudit, related []*model.RequestAudit, err error, selection requestAuditPayloadSelection) {
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) || model.IsRequestAuditNotFound(err) {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "未找到对应的请求审计记录",
			})
			return
		}
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildRequestAuditResponseWithSelection(audit, buildRelatedAuditRecords(related), selection))
}

func buildRequestAuditResponse(audit *model.RequestAudit, relatedRecords []gin.H, includePayloads bool) gin.H {
	selection := requestAuditPayloadNone
	if includePayloads {
		selection = requestAuditPayloadAll
	}
	return buildRequestAuditResponseWithSelection(audit, relatedRecords, selection)
}

func buildRequestAuditResponseWithSelection(audit *model.RequestAudit, relatedRecords []gin.H, selection requestAuditPayloadSelection) gin.H {
	var requestPayload any
	var responsePayload any
	var tracePayload any
	if selection.includesRequestPayload() {
		requestPayload = parseAuditPayload(string(audit.RequestPayload))
	}
	if selection.exposesResponsePayload() {
		responsePayload = parseAuditPayload(string(audit.ResponsePayload))
	}
	if selection.includesTracePayload() {
		tracePayload = parseAuditPayload(string(audit.TracePayload))
	}
	upstreamRequestPayload, upstreamResponsePayload, tracePayload := splitAuditWirePayloads(tracePayload)
	upstreamModelName, tracePayload := enrichAuditModelResolution(audit, tracePayload)
	aggregatedText := ""
	if selection.includesResponsePayload() {
		aggregatedText = model.ExtractAggregatedTextFromResponsePayload(string(audit.ResponsePayload))
	} else if audit.AggregatedTextPreview != nil {
		aggregatedText = *audit.AggregatedTextPreview
	}
	response := gin.H{
		"id":                  audit.ID,
		"request_id":          audit.RequestID,
		"user_id":             audit.UserId,
		"username":            audit.Username,
		"mode":                audit.Mode,
		"route_group":         audit.RouteGroup,
		"route_path":          audit.RoutePath,
		"method":              audit.Method,
		"status_code":         audit.StatusCode,
		"success":             audit.Success,
		"relay_format":        audit.RelayFormat,
		"relay_mode":          audit.RelayMode,
		"is_stream":           audit.IsStream,
		"is_playground":       audit.IsPlayground,
		"model_name":          audit.ModelName,
		"upstream_model_name": upstreamModelName,
		"group":               audit.Group,
		"token_id":            audit.TokenId,
		"token_name":          audit.TokenName,
		"channel_id":          audit.ChannelId,
		"channel_name":        audit.ChannelName,
		"channel_type":        audit.ChannelType,
		"task_id":             audit.TaskID,
		"mj_id":               audit.MjID,
		"created_at":          audit.CreatedAt,
		"updated_at":          audit.UpdatedAt,
		"started_at":          audit.StartedAt,
		"finished_at":         audit.FinishedAt,
		"latency_ms":          audit.LatencyMs,
		"first_response_ms":   audit.FirstResponseMs,
		"retry_count":         audit.RetryCount,
		"aggregated_text":     aggregatedText,
		"payloads_loaded":     selection == requestAuditPayloadAll,
		"related_records":     relatedRecords,
	}
	if selection != requestAuditPayloadNone && selection != requestAuditPayloadAll {
		response["payload_section"] = string(selection)
	}
	switch selection {
	case requestAuditPayloadAll:
		response["client_request"] = requestPayload
		response["upstream_request"] = upstreamRequestPayload
		response["upstream_response"] = upstreamResponsePayload
		response["client_response"] = responsePayload
		// Keep the original keys for older audit clients.
		response["request"] = requestPayload
		response["response"] = responsePayload
		response["trace"] = tracePayload
	case requestAuditPayloadClientRequest:
		response["client_request"] = requestPayload
	case requestAuditPayloadUpstreamRequest:
		response["upstream_request"] = upstreamRequestPayload
	case requestAuditPayloadUpstreamResponse:
		response["upstream_response"] = upstreamResponsePayload
	case requestAuditPayloadClientResponse:
		response["client_response"] = responsePayload
	case requestAuditPayloadTrace:
		response["trace"] = tracePayload
	}
	return response
}

func (selection requestAuditPayloadSelection) modelFields() model.RequestAuditPayloadFields {
	switch selection {
	case requestAuditPayloadAll:
		return model.RequestAuditAllPayloads
	case requestAuditPayloadClientRequest:
		return model.RequestAuditRequestPayload
	case requestAuditPayloadAnswer, requestAuditPayloadClientResponse:
		return model.RequestAuditResponsePayload
	case requestAuditPayloadTrace, requestAuditPayloadUpstreamRequest, requestAuditPayloadUpstreamResponse:
		return model.RequestAuditTracePayload
	default:
		return 0
	}
}

func loadRequestAuditPayloadSelection(audit *model.RequestAudit, selection requestAuditPayloadSelection) error {
	fields := selection.modelFields()
	needsLegacyPreview := audit != nil && audit.AggregatedTextPreview == nil
	if needsLegacyPreview {
		fields |= model.RequestAuditResponsePayload
	}
	if err := model.LoadRequestAuditPayloads(audit, fields); err != nil {
		return err
	}
	if needsLegacyPreview {
		model.SetRequestAuditAggregatedTextPreviewFromStoredPayload(audit)
	}
	return nil
}

func (selection requestAuditPayloadSelection) includesRequestPayload() bool {
	return selection == requestAuditPayloadAll || selection == requestAuditPayloadClientRequest
}

func (selection requestAuditPayloadSelection) includesResponsePayload() bool {
	return selection == requestAuditPayloadAll || selection == requestAuditPayloadAnswer || selection == requestAuditPayloadClientResponse
}

func (selection requestAuditPayloadSelection) exposesResponsePayload() bool {
	return selection == requestAuditPayloadAll || selection == requestAuditPayloadClientResponse
}

func (selection requestAuditPayloadSelection) includesTracePayload() bool {
	return selection == requestAuditPayloadAll || selection == requestAuditPayloadTrace || selection == requestAuditPayloadUpstreamRequest || selection == requestAuditPayloadUpstreamResponse
}

func splitAuditWirePayloads(tracePayload any) (any, any, any) {
	upstreamRequest := any(map[string]any{})
	upstreamResponse := any(map[string]any{})
	traceMap, ok := tracePayload.(map[string]any)
	if !ok || traceMap == nil {
		return upstreamRequest, upstreamResponse, tracePayload
	}
	if value, exists := traceMap["upstream_request"]; exists {
		upstreamRequest = value
		delete(traceMap, "upstream_request")
	}
	if value, exists := traceMap["upstream_response"]; exists {
		upstreamResponse = value
		delete(traceMap, "upstream_response")
	}
	return upstreamRequest, upstreamResponse, traceMap
}

func enrichAuditModelResolution(audit *model.RequestAudit, tracePayload any) (string, any) {
	if audit == nil {
		return "", tracePayload
	}
	traceMap, _ := tracePayload.(map[string]any)
	if traceMap == nil {
		traceMap = make(map[string]any)
	}
	modelResolution, _ := traceMap["model_resolution"].(map[string]any)
	if modelResolution == nil {
		modelResolution = make(map[string]any)
	}

	requestedModel := audit.ModelName
	if requestedModel == "" {
		requestedModel = common.Interface2String(modelResolution["requested_model"])
	}
	upstreamModel := audit.UpstreamModelName
	if upstreamModel == "" {
		upstreamModel = common.Interface2String(modelResolution["upstream_model"])
	}
	isModelMapped, _ := modelResolution["is_model_mapped"].(bool)

	if audit.RequestID != "" {
		logs, err := model.GetRequestLogsByRequestID(audit.RequestID)
		if err == nil {
			for i := len(logs) - 1; i >= 0; i-- {
				logItem := logs[i]
				if logItem == nil {
					continue
				}
				if requestedModel == "" && logItem.ModelName != "" {
					requestedModel = logItem.ModelName
				}
				otherMap, ok := parseAuditPayload(logItem.Other).(map[string]any)
				if !ok {
					continue
				}
				if upstreamModel == "" {
					upstreamModel = common.Interface2String(otherMap["upstream_model_name"])
				}
				if !isModelMapped {
					if mapped, ok := otherMap["is_model_mapped"].(bool); ok {
						isModelMapped = mapped
					}
				}
				if requestedModel != "" && upstreamModel != "" && isModelMapped {
					break
				}
			}
		}
	}

	if !isModelMapped && requestedModel != "" && upstreamModel != "" && requestedModel != upstreamModel {
		isModelMapped = true
	}

	if requestedModel != "" || upstreamModel != "" || isModelMapped {
		modelResolution["requested_model"] = requestedModel
		modelResolution["upstream_model"] = upstreamModel
		modelResolution["is_model_mapped"] = isModelMapped
		traceMap["model_resolution"] = modelResolution
		tracePayload = traceMap
	}

	return upstreamModel, tracePayload
}

func buildRelatedAuditRecords(audits []*model.RequestAudit) []gin.H {
	if len(audits) == 0 {
		return []gin.H{}
	}
	items := make([]gin.H, 0, len(audits))
	seen := make(map[string]struct{}, len(audits))
	for _, audit := range audits {
		if audit == nil || audit.RequestID == "" {
			continue
		}
		if _, ok := seen[audit.RequestID]; ok {
			continue
		}
		seen[audit.RequestID] = struct{}{}
		items = append(items, gin.H{
			"request_id":    audit.RequestID,
			"route_group":   audit.RouteGroup,
			"route_path":    audit.RoutePath,
			"method":        audit.Method,
			"status_code":   audit.StatusCode,
			"success":       audit.Success,
			"created_at":    audit.CreatedAt,
			"latency_ms":    audit.LatencyMs,
			"retry_count":   audit.RetryCount,
			"model_name":    audit.ModelName,
			"channel_name":  audit.ChannelName,
			"channel_type":  audit.ChannelType,
			"is_stream":     audit.IsStream,
			"is_playground": audit.IsPlayground,
		})
	}
	return items
}

func parseAuditPayload(raw string) any {
	if raw == "" {
		return map[string]any{}
	}
	var payload any
	if err := common.Unmarshal([]byte(raw), &payload); err != nil {
		return raw
	}
	if payloadMap, ok := payload.(map[string]any); ok {
		delete(payloadMap, model.RequestAuditAggregatedTextPreviewKey)
	}
	return payload
}

func shouldIncludeRequestAuditPayloads(c *gin.Context) bool {
	raw := strings.TrimSpace(strings.ToLower(c.Query("include_payloads")))
	switch raw {
	case "", "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return true
	}
}

func getRequestAuditPayloadSelection(c *gin.Context) (requestAuditPayloadSelection, bool) {
	payload := requestAuditPayloadSelection(strings.TrimSpace(strings.ToLower(c.Query("payload"))))
	if payload == requestAuditPayloadNone {
		if shouldIncludeRequestAuditPayloads(c) {
			return requestAuditPayloadAll, true
		}
		return requestAuditPayloadNone, true
	}

	switch payload {
	case requestAuditPayloadAnswer,
		requestAuditPayloadTrace,
		requestAuditPayloadClientRequest,
		requestAuditPayloadUpstreamRequest,
		requestAuditPayloadUpstreamResponse,
		requestAuditPayloadClientResponse:
		return payload, true
	default:
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "不支持的审计载荷类型",
		})
		return requestAuditPayloadNone, false
	}
}
