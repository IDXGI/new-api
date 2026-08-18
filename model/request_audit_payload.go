package model

import (
	"database/sql/driver"
	"encoding/base64"
	"fmt"
	"strings"
	"sync"

	"github.com/klauspost/compress/zstd"
)

const (
	requestAuditPayloadCompressionPrefix    = "zstd:v1:"
	requestAuditPayloadCompressionThreshold = 32 << 10
)

var (
	requestAuditPayloadEncoderOnce sync.Once
	requestAuditPayloadEncoder     *zstd.Encoder
	requestAuditPayloadEncoderErr  error
	requestAuditPayloadDecoderOnce sync.Once
	requestAuditPayloadDecoder     *zstd.Decoder
	requestAuditPayloadDecoderErr  error
)

func (payload RequestAuditPayload) Value() (driver.Value, error) {
	raw := string(payload)
	if len(raw) < requestAuditPayloadCompressionThreshold {
		return raw, nil
	}

	requestAuditPayloadEncoderOnce.Do(func() {
		requestAuditPayloadEncoder, requestAuditPayloadEncoderErr = zstd.NewWriter(
			nil,
			zstd.WithEncoderLevel(zstd.SpeedFastest),
			zstd.WithEncoderConcurrency(1),
		)
	})
	if requestAuditPayloadEncoderErr != nil {
		return raw, nil
	}

	compressed := requestAuditPayloadEncoder.EncodeAll([]byte(raw), nil)
	encoded := requestAuditPayloadCompressionPrefix + base64.StdEncoding.EncodeToString(compressed)
	if len(encoded) >= len(raw) {
		return raw, nil
	}
	return encoded, nil
}

func (payload *RequestAuditPayload) Scan(value any) error {
	if payload == nil {
		return fmt.Errorf("scan request audit payload: nil destination")
	}

	var stored string
	switch value := value.(type) {
	case nil:
		*payload = ""
		return nil
	case string:
		stored = value
	case []byte:
		stored = string(value)
	default:
		return fmt.Errorf("scan request audit payload: unsupported source type %T", value)
	}

	if !strings.HasPrefix(stored, requestAuditPayloadCompressionPrefix) {
		*payload = RequestAuditPayload(stored)
		return nil
	}

	compressed, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(stored, requestAuditPayloadCompressionPrefix))
	if err != nil {
		return fmt.Errorf("decode request audit payload base64: %w", err)
	}
	requestAuditPayloadDecoderOnce.Do(func() {
		requestAuditPayloadDecoder, requestAuditPayloadDecoderErr = zstd.NewReader(
			nil,
			zstd.WithDecoderConcurrency(1),
		)
	})
	if requestAuditPayloadDecoderErr != nil {
		return fmt.Errorf("initialize request audit payload decoder: %w", requestAuditPayloadDecoderErr)
	}
	decoded, err := requestAuditPayloadDecoder.DecodeAll(compressed, nil)
	if err != nil {
		return fmt.Errorf("decompress request audit payload: %w", err)
	}
	*payload = RequestAuditPayload(decoded)
	return nil
}
