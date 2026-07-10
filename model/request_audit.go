package model

import (
	"context"
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

const (
	taskAuditOrderExpr = "CASE " +
		"WHEN route_group = 'task_submit' THEN 0 " +
		"WHEN route_group = 'task_fetch' THEN 1 " +
		"WHEN route_group = 'task_content' THEN 2 " +
		"ELSE 3 END, id DESC"
	mjAuditOrderExpr = "CASE " +
		"WHEN route_group = 'midjourney_submit' THEN 0 " +
		"WHEN route_group = 'midjourney_fetch' THEN 1 " +
		"WHEN route_group = 'midjourney_image_seed' THEN 2 " +
		"WHEN route_group = 'midjourney_notify' THEN 3 " +
		"ELSE 4 END, id DESC"
)

type RequestAudit struct {
	ID                int64               `json:"id" gorm:"primaryKey;autoIncrement"`
	CreatedAt         int64               `json:"created_at" gorm:"bigint;index:idx_request_audits_created_at"`
	UpdatedAt         int64               `json:"updated_at" gorm:"bigint"`
	RequestID         string              `json:"request_id" gorm:"type:varchar(64);uniqueIndex"`
	UserId            int                 `json:"user_id" gorm:"index"`
	Username          string              `json:"username" gorm:"type:varchar(64);index;default:''"`
	Mode              string              `json:"mode" gorm:"type:varchar(16);index;default:''"`
	RouteGroup        string              `json:"route_group" gorm:"type:varchar(32);index;default:''"`
	RoutePath         string              `json:"route_path" gorm:"type:varchar(255);index;default:''"`
	Method            string              `json:"method" gorm:"type:varchar(16);default:''"`
	StatusCode        int                 `json:"status_code" gorm:"index"`
	Success           bool                `json:"success" gorm:"index"`
	RelayFormat       string              `json:"relay_format" gorm:"type:varchar(32);index;default:''"`
	RelayMode         int                 `json:"relay_mode" gorm:"index"`
	IsStream          bool                `json:"is_stream"`
	IsPlayground      bool                `json:"is_playground"`
	ModelName         string              `json:"model_name" gorm:"type:varchar(128);index;default:''"`
	UpstreamModelName string              `json:"upstream_model_name" gorm:"type:varchar(128);default:''"`
	Group             string              `json:"group" gorm:"column:group;type:varchar(64);index;default:''"`
	TokenId           int                 `json:"token_id" gorm:"index"`
	TokenName         string              `json:"token_name" gorm:"type:varchar(128);index;default:''"`
	ChannelId         int                 `json:"channel_id" gorm:"index"`
	ChannelName       string              `json:"channel_name" gorm:"type:varchar(128);default:''"`
	ChannelType       int                 `json:"channel_type" gorm:"index"`
	TaskID            string              `json:"task_id" gorm:"type:varchar(191);index;default:''"`
	MjID              string              `json:"mj_id" gorm:"type:varchar(191);index;default:''"`
	StartedAt         int64               `json:"started_at" gorm:"bigint;index"`
	FinishedAt        int64               `json:"finished_at" gorm:"bigint;index"`
	LatencyMs         int64               `json:"latency_ms"`
	FirstResponseMs   int64               `json:"first_response_ms"`
	RetryCount        int                 `json:"retry_count"`
	RequestPayload    RequestAuditPayload `json:"request_payload"`
	ResponsePayload   RequestAuditPayload `json:"response_payload"`
	TracePayload      RequestAuditPayload `json:"trace_payload"`
}

type RequestAuditPayload string

func (RequestAuditPayload) GormDataType() string {
	return "text"
}

func (RequestAuditPayload) GormDBDataType(db *gorm.DB, _ *schema.Field) string {
	if db != nil && db.Dialector != nil && db.Dialector.Name() == "mysql" {
		return "MEDIUMTEXT"
	}
	return "TEXT"
}

func UpsertRequestAudit(audit *RequestAudit) error {
	if audit == nil {
		return nil
	}
	return LOG_DB.Save(audit).Error
}

func GetRequestAuditByRequestID(requestID string) (*RequestAudit, error) {
	var audit RequestAudit
	err := LOG_DB.Where("request_id = ?", requestID).First(&audit).Error
	if err != nil {
		return nil, err
	}
	return &audit, nil
}

func GetPreferredRequestAuditByTaskID(taskID string) (*RequestAudit, error) {
	var audit RequestAudit
	err := LOG_DB.Where("task_id = ?", taskID).Order(taskAuditOrderExpr).First(&audit).Error
	if err != nil {
		return nil, err
	}
	return &audit, nil
}

func GetPreferredRequestAuditByMJID(mjID string) (*RequestAudit, error) {
	var audit RequestAudit
	err := LOG_DB.Where("mj_id = ?", mjID).Order(mjAuditOrderExpr).First(&audit).Error
	if err != nil {
		return nil, err
	}
	return &audit, nil
}

func ListRequestAuditsByTaskID(taskID string, limit int) ([]*RequestAudit, error) {
	if limit <= 0 {
		limit = 10
	}
	var audits []*RequestAudit
	err := LOG_DB.Where("task_id = ?", taskID).Order(taskAuditOrderExpr).Limit(limit).Find(&audits).Error
	if err != nil {
		return nil, err
	}
	return audits, nil
}

func ListRequestAuditsByMJID(mjID string, limit int) ([]*RequestAudit, error) {
	if limit <= 0 {
		limit = 10
	}
	var audits []*RequestAudit
	err := LOG_DB.Where("mj_id = ?", mjID).Order(mjAuditOrderExpr).Limit(limit).Find(&audits).Error
	if err != nil {
		return nil, err
	}
	return audits, nil
}

func CountOldRequestAudits(ctx context.Context, targetTimestamp int64) (int64, error) {
	var total int64
	if err := LOG_DB.WithContext(ctx).
		Model(&RequestAudit{}).
		Where("created_at < ?", targetTimestamp).
		Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func DeleteOldRequestAuditBatch(ctx context.Context, targetTimestamp int64, batchSize int) (int64, error) {
	if batchSize <= 0 {
		batchSize = 1000
	}
	if err := ctx.Err(); err != nil {
		return 0, err
	}

	var ids []int64
	if err := LOG_DB.WithContext(ctx).
		Model(&RequestAudit{}).
		Where("created_at < ?", targetTimestamp).
		Order("id asc").
		Limit(batchSize).
		Pluck("id", &ids).Error; err != nil {
		return 0, err
	}
	if len(ids) == 0 {
		return 0, nil
	}

	result := LOG_DB.WithContext(ctx).Delete(&RequestAudit{}, ids)
	if result.Error != nil {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}

func DeleteOldRequestAudits(ctx context.Context, targetTimestamp int64, batchSize int) (int64, error) {
	var total int64
	if batchSize <= 0 {
		batchSize = 1000
	}
	for {
		rowsAffected, err := DeleteOldRequestAuditBatch(ctx, targetTimestamp, batchSize)
		if err != nil {
			return total, err
		}
		total += rowsAffected
		if rowsAffected == 0 {
			return total, nil
		}
	}
}

func ExtractAggregatedTextFromResponsePayload(raw string) string {
	if strings.TrimSpace(raw) == "" {
		return ""
	}
	var payload map[string]any
	if err := common.Unmarshal([]byte(raw), &payload); err != nil {
		return ""
	}
	return ExtractAggregatedTextFromAuditPayload(payload)
}

func GetAggregatedTextsByRequestIDs(requestIDs []string) (map[string]string, error) {
	result := make(map[string]string)
	if len(requestIDs) == 0 {
		return result, nil
	}

	uniqueIDs := make([]string, 0, len(requestIDs))
	seen := make(map[string]struct{}, len(requestIDs))
	for _, requestID := range requestIDs {
		requestID = strings.TrimSpace(requestID)
		if requestID == "" {
			continue
		}
		if _, ok := seen[requestID]; ok {
			continue
		}
		seen[requestID] = struct{}{}
		uniqueIDs = append(uniqueIDs, requestID)
	}
	if len(uniqueIDs) == 0 {
		return result, nil
	}

	var audits []struct {
		RequestID       string `gorm:"column:request_id"`
		ResponsePayload string `gorm:"column:response_payload"`
	}
	if err := LOG_DB.Model(&RequestAudit{}).
		Select("request_id, response_payload").
		Where("request_id IN ?", uniqueIDs).
		Find(&audits).Error; err != nil {
		return nil, err
	}

	for _, audit := range audits {
		aggregatedText := ExtractAggregatedTextFromResponsePayload(audit.ResponsePayload)
		if aggregatedText == "" {
			continue
		}
		result[audit.RequestID] = aggregatedText
	}
	return result, nil
}

func GetRequestLogsByRequestID(requestID string) ([]*Log, error) {
	var logs []*Log
	err := LOG_DB.Model(&Log{}).Where("request_id = ?", requestID).Order("id asc").Find(&logs).Error
	if err != nil {
		return nil, err
	}
	return logs, nil
}

func IsRequestAuditNotFound(err error) bool {
	return errors.Is(err, gorm.ErrRecordNotFound)
}
