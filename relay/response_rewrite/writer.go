package response_rewrite

import (
	"bytes"
	"strconv"

	"github.com/gin-gonic/gin"
)

type responseIdentityWriter struct {
	gin.ResponseWriter
	context *gin.Context
}

func WrapResponseWriter(c *gin.Context) {
	if c == nil || c.Writer == nil {
		return
	}
	if _, ok := GetClientResponseIdentity(c); !ok {
		return
	}
	if _, ok := c.Writer.(*responseIdentityWriter); ok {
		return
	}
	c.Writer = &responseIdentityWriter{
		ResponseWriter: c.Writer,
		context:        c,
	}
}

func (w *responseIdentityWriter) Write(data []byte) (int, error) {
	rewritten, isEventStream, err := rewriteWireChunk(w.context, data)
	if err != nil {
		rewritten = data
	}
	w.updateContentLength(data, rewritten, isEventStream)
	written, writeErr := w.ResponseWriter.Write(rewritten)
	if writeErr != nil {
		return written, writeErr
	}
	return len(data), nil
}

func (w *responseIdentityWriter) WriteString(data string) (int, error) {
	original := []byte(data)
	rewritten, isEventStream, err := rewriteWireChunk(w.context, original)
	if err != nil {
		rewritten = original
	}
	w.updateContentLength(original, rewritten, isEventStream)
	written, writeErr := w.ResponseWriter.WriteString(string(rewritten))
	if writeErr != nil {
		return written, writeErr
	}
	return len(data), nil
}

func (w *responseIdentityWriter) updateContentLength(original, rewritten []byte, isEventStream bool) {
	if isEventStream || bytes.Equal(original, rewritten) {
		return
	}
	if w.Header().Get("Content-Length") != "" {
		w.Header().Set("Content-Length", strconv.Itoa(len(rewritten)))
	}
}

func rewriteWireChunk(c *gin.Context, data []byte) ([]byte, bool, error) {
	if len(data) == 0 {
		return data, false, nil
	}
	if bytes.HasPrefix(data, []byte("data:")) || bytes.Contains(data, []byte("\ndata:")) {
		rewritten, err := rewriteSSEDataLines(c, data)
		return rewritten, true, err
	}
	rewritten, err := RewriteJSON(c, data)
	return rewritten, false, err
}

func rewriteSSEDataLines(c *gin.Context, data []byte) ([]byte, error) {
	lines := bytes.SplitAfter(data, []byte("\n"))
	var output []byte
	changed := false
	for index, line := range lines {
		lineEnd := len(line)
		if lineEnd > 0 && line[lineEnd-1] == '\n' {
			lineEnd--
		}
		if lineEnd > 0 && line[lineEnd-1] == '\r' {
			lineEnd--
		}
		content := line[:lineEnd]
		if !bytes.HasPrefix(content, []byte("data:")) {
			if changed {
				output = append(output, line...)
			}
			continue
		}

		payloadStart := len("data:")
		if payloadStart < len(content) && content[payloadStart] == ' ' {
			payloadStart++
		}
		rewrittenPayload, err := RewriteJSON(c, content[payloadStart:])
		if err != nil {
			return data, err
		}
		if bytes.Equal(rewrittenPayload, content[payloadStart:]) {
			if changed {
				output = append(output, line...)
			}
			continue
		}
		if !changed {
			changed = true
			for _, previous := range lines[:index] {
				output = append(output, previous...)
			}
		}
		output = append(output, line[:payloadStart]...)
		output = append(output, rewrittenPayload...)
		output = append(output, line[lineEnd:]...)
	}
	if !changed {
		return data, nil
	}
	return output, nil
}
