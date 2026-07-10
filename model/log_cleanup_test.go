package model

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDeleteOldLogCleansRequestAuditsAtSameBoundary(t *testing.T) {
	truncateTables(t)

	const targetTimestamp int64 = 100
	logs := []Log{
		{CreatedAt: 10, RequestId: "old-request-1"},
		{CreatedAt: 20, RequestId: "old-request-2"},
		{CreatedAt: 200, RequestId: "new-request"},
	}
	audits := []RequestAudit{
		{CreatedAt: 10, RequestID: "old-request-1", RequestPayload: "large old payload 1"},
		{CreatedAt: 20, RequestID: "old-request-2", ResponsePayload: "large old payload 2"},
		{CreatedAt: 200, RequestID: "new-request", TracePayload: "new payload"},
	}
	require.NoError(t, LOG_DB.Create(&logs).Error)
	require.NoError(t, LOG_DB.Create(&audits).Error)

	count, err := CountOldLogCleanupRows(context.Background(), targetTimestamp)
	require.NoError(t, err)
	assert.Equal(t, int64(4), count)

	deleted, err := DeleteOldLog(context.Background(), targetTimestamp, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(4), deleted)

	var oldLogCount int64
	require.NoError(t, LOG_DB.Model(&Log{}).Where("created_at < ?", targetTimestamp).Count(&oldLogCount).Error)
	assert.Zero(t, oldLogCount)

	var oldAuditCount int64
	require.NoError(t, LOG_DB.Model(&RequestAudit{}).Where("created_at < ?", targetTimestamp).Count(&oldAuditCount).Error)
	assert.Zero(t, oldAuditCount)

	var newLogCount int64
	require.NoError(t, LOG_DB.Model(&Log{}).Where("request_id = ?", "new-request").Count(&newLogCount).Error)
	assert.Equal(t, int64(1), newLogCount)

	var newAuditCount int64
	require.NoError(t, LOG_DB.Model(&RequestAudit{}).Where("request_id = ?", "new-request").Count(&newAuditCount).Error)
	assert.Equal(t, int64(1), newAuditCount)
}
