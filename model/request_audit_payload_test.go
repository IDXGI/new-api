package model

import (
	"database/sql/driver"
	"encoding/base64"
	"strings"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestRequestAuditPayloadValueKeepsSmallPayloadPlaintext(t *testing.T) {
	payload := RequestAuditPayload(`{"model":"client-model"}`)

	stored, err := payload.Value()

	require.NoError(t, err)
	assert.Equal(t, driver.Value(string(payload)), stored)
}

func TestRequestAuditPayloadCompressedRoundTrip(t *testing.T) {
	payload := RequestAuditPayload(`{"body_text":"` + strings.Repeat("long audit response ", 4096) + `"}`)

	stored, err := payload.Value()
	require.NoError(t, err)
	storedText, ok := stored.(string)
	require.True(t, ok)
	require.True(t, strings.HasPrefix(storedText, requestAuditPayloadCompressionPrefix))
	require.Less(t, len(storedText), len(payload))

	var decoded RequestAuditPayload
	require.NoError(t, decoded.Scan(storedText))
	assert.Equal(t, payload, decoded)
}

func TestRequestAuditPayloadScanReadsLegacyPlaintext(t *testing.T) {
	legacy := `{"body_kind":"json","body_json":{"model":"legacy"}}`
	var payload RequestAuditPayload

	require.NoError(t, payload.Scan([]byte(legacy)))
	assert.Equal(t, RequestAuditPayload(legacy), payload)
}

func TestRequestAuditPayloadScanRejectsInvalidCompressedValue(t *testing.T) {
	var payload RequestAuditPayload

	err := payload.Scan(requestAuditPayloadCompressionPrefix + "not-base64")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "base64")
}

func TestRequestAuditPayloadScanRejectsCorruptZstdFrame(t *testing.T) {
	var payload RequestAuditPayload
	stored := requestAuditPayloadCompressionPrefix + base64.StdEncoding.EncodeToString([]byte("not-zstd"))

	err := payload.Scan(stored)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "decompress")
}

func TestRequestAuditPayloadGORMStoresCompressedAndReadsPlaintext(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&RequestAudit{}))

	original := RequestAuditPayload(`{"body_text":"` + strings.Repeat("compressible audit payload ", 4096) + `"}`)
	audit := &RequestAudit{RequestID: "req-zstd-round-trip", ResponsePayload: original}
	require.NoError(t, db.Create(audit).Error)

	var stored string
	require.NoError(t, db.Raw(
		"SELECT response_payload FROM request_audits WHERE request_id = ?",
		audit.RequestID,
	).Scan(&stored).Error)
	require.True(t, strings.HasPrefix(stored, requestAuditPayloadCompressionPrefix))

	var loaded RequestAudit
	require.NoError(t, db.Where("request_id = ?", audit.RequestID).First(&loaded).Error)
	assert.Equal(t, original, loaded.ResponsePayload)
}

func TestGetAggregatedTextsUsesStoredPreviewAndFallsBackForLegacyRows(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&RequestAudit{}))
	previousLogDB := LOG_DB
	LOG_DB = db
	t.Cleanup(func() {
		LOG_DB = previousLogDB
	})

	storedPreview := "new record preview"
	emptyPreview := ""
	audits := []RequestAudit{
		{
			RequestID:             "req-preview",
			AggregatedTextPreview: &storedPreview,
			ResponsePayload:       RequestAuditPayload(requestAuditPayloadCompressionPrefix + "invalid"),
		},
		{
			RequestID:             "req-empty",
			AggregatedTextPreview: &emptyPreview,
			ResponsePayload:       RequestAuditPayload(requestAuditPayloadCompressionPrefix + "invalid"),
		},
		{
			RequestID: "req-legacy",
			ResponsePayload: RequestAuditPayload(`{
				"body_kind":"json",
				"body_json":{"choices":[{"message":{"content":"legacy full answer"}}]}
			}`),
		},
	}
	require.NoError(t, db.Create(&audits).Error)

	previews, err := GetAggregatedTextsByRequestIDs([]string{"req-preview", "req-empty", "req-legacy"})

	require.NoError(t, err)
	assert.Equal(t, "new record preview", previews["req-preview"])
	assert.Equal(t, "", previews["req-empty"])
	assert.Equal(t, "legacy full answer", previews["req-legacy"])
}

func TestRequestAuditOverviewAndPayloadLoaderReadOnlySelectedLargeFields(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&RequestAudit{}))
	previousLogDB := LOG_DB
	LOG_DB = db
	t.Cleanup(func() {
		LOG_DB = previousLogDB
	})

	emptyPreview := ""
	audit := &RequestAudit{
		RequestID:             "req-selective-payload",
		AggregatedTextPreview: &emptyPreview,
		RequestPayload:        RequestAuditPayload(requestAuditPayloadCompressionPrefix + "invalid-request"),
		ResponsePayload:       RequestAuditPayload(requestAuditPayloadCompressionPrefix + "invalid-response"),
		TracePayload:          RequestAuditPayload(`{"trace":"selected"}`),
	}
	require.NoError(t, db.Create(audit).Error)

	overview, err := GetRequestAuditOverviewByRequestID(audit.RequestID)
	require.NoError(t, err)
	assert.Empty(t, overview.RequestPayload)
	assert.Empty(t, overview.ResponsePayload)
	assert.Empty(t, overview.TracePayload)

	require.NoError(t, LoadRequestAuditPayloads(overview, RequestAuditTracePayload))
	assert.Empty(t, overview.RequestPayload)
	assert.Empty(t, overview.ResponsePayload)
	assert.Equal(t, RequestAuditPayload(`{"trace":"selected"}`), overview.TracePayload)
}
