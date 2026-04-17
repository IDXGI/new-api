import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Descriptions,
  Empty,
  Modal,
  Space,
  Spin,
  Tag,
  Tabs,
  Typography,
} from '@douyinfe/semi-ui';
import { copy, showError, showSuccess } from '../../helpers';

const { TabPane } = Tabs;

const RELATED_FILTER_ALL = 'all';

function getRelatedCategory(routeGroup) {
  if (!routeGroup) {
    return 'other';
  }
  if (routeGroup.includes('submit')) {
    return 'submit';
  }
  if (routeGroup.includes('fetch')) {
    return 'fetch';
  }
  if (routeGroup.includes('content')) {
    return 'content';
  }
  if (routeGroup.includes('notify')) {
    return 'notify';
  }
  if (routeGroup.includes('seed')) {
    return 'seed';
  }
  return 'other';
}

function getRelatedCategoryLabel(category, t) {
  switch (category) {
    case RELATED_FILTER_ALL:
      return t('全部');
    case 'submit':
      return t('提交');
    case 'fetch':
      return t('查询');
    case 'content':
      return t('内容');
    case 'notify':
      return t('回调');
    case 'seed':
      return t('种子');
    default:
      return t('其他');
  }
}

function renderRelatedTitle(record, t) {
  if (!record) {
    return '-';
  }
  const routeGroup = record.route_group || '-';
  const method = record.method || '-';
  const statusCode = record.status_code ?? '-';
  return `${routeGroup} · ${method} · ${statusCode}`;
}

function formatAuditTimestamp(timestamp) {
  if (!timestamp) {
    return '-';
  }
  const normalized = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatDurationMs(value, emptyAsDash = false) {
  if (value === undefined || value === null || value === '') {
    return emptyAsDash ? '-' : '0 ms';
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return emptyAsDash ? '-' : '0 ms';
  }
  if (emptyAsDash && number <= 0) {
    return '-';
  }
  return `${number} ms`;
}

function renderBooleanTag(value, t, trueLabel = null, falseLabel = null) {
  return (
    <Tag color={value ? 'green' : 'grey'} shape='circle'>
      {value ? trueLabel || t('是') : falseLabel || t('否')}
    </Tag>
  );
}

function renderStatusTag(record, t) {
  const success = Boolean(record?.success);
  return (
    <Tag color={success ? 'green' : 'red'} shape='circle'>
      {`${success ? t('成功') : t('失败')} · ${record?.status_code ?? '-'}`}
    </Tag>
  );
}

function getModelMappingValue(record, t) {
  if (!record) {
    return '-';
  }
  const requestedModel = record.model_name || '';
  const upstreamModel =
    record.upstream_model_name || record?.trace?.model_resolution?.upstream_model || '';
  const isModelMapped =
    record?.trace?.model_resolution?.is_model_mapped ||
    (requestedModel && upstreamModel && requestedModel !== upstreamModel);
  if (!requestedModel && !upstreamModel) {
    return '-';
  }
  if (!isModelMapped || !upstreamModel || requestedModel === upstreamModel) {
    return t('未发生映射');
  }
  return `${requestedModel} -> ${upstreamModel}`;
}

function stringifyValue(value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

function getAuditAggregatedText(auditRecord) {
  if (!auditRecord) {
    return '';
  }
  if (typeof auditRecord.aggregated_text === 'string') {
    return auditRecord.aggregated_text.trim();
  }
  const responsePayload = auditRecord.response;
  if (responsePayload && typeof responsePayload === 'object') {
    const aggregatedText = responsePayload.aggregated_text;
    if (typeof aggregatedText === 'string') {
      return aggregatedText.trim();
    }
  }
  return '';
}

function renderTextValue(value, code = false) {
  const displayValue =
    value === undefined || value === null || value === '' ? '-' : String(value);
  return (
    <Typography.Text
      style={{
        wordBreak: code ? 'break-all' : 'break-word',
        fontFamily: code
          ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace'
          : undefined,
      }}
    >
      {displayValue}
    </Typography.Text>
  );
}

function MetricCard({ label, value, extra }) {
  return (
    <div
      style={{
        border: '1px solid var(--semi-color-border)',
        background: 'var(--semi-color-fill-0)',
        borderRadius: 14,
        padding: '14px 16px',
        minHeight: 102,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <Typography.Text type='tertiary'>{label}</Typography.Text>
      <Typography.Text
        strong
        style={{
          fontSize: 18,
          lineHeight: 1.45,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </Typography.Text>
      {extra ? (
        <Typography.Text type='secondary' size='small'>
          {extra}
        </Typography.Text>
      ) : null}
    </div>
  );
}

function SectionPanel({ title, subtitle, extra, children }) {
  return (
    <div
      style={{
        border: '1px solid var(--semi-color-border)',
        background: 'var(--semi-color-bg-1)',
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Typography.Text strong>{title}</Typography.Text>
          {subtitle ? (
            <Typography.Text
              type='secondary'
              style={{ display: 'block', marginTop: 4 }}
            >
              {subtitle}
            </Typography.Text>
          ) : null}
        </div>
        {extra}
      </div>
      {children}
    </div>
  );
}

function JsonBlock({ value, t }) {
  const content = stringifyValue(value);
  if (!content) {
    return <Empty description={t('无数据')} image={null} />;
  }
  return (
    <div
      style={{
        border: '1px solid var(--semi-color-border)',
        borderRadius: 12,
        background: 'var(--semi-color-fill-0)',
        overflow: 'hidden',
      }}
    >
      <pre
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.7,
          maxHeight: 'min(48vh, 520px)',
          overflow: 'auto',
          padding: 16,
          margin: 0,
          fontSize: 12,
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
        }}
      >
        {content}
      </pre>
    </div>
  );
}

const RequestAuditModal = ({
  visible,
  onCancel,
  loading,
  auditRecord,
  onOpenRequestAudit,
  t,
}) => {
  const [relatedFilter, setRelatedFilter] = useState(RELATED_FILTER_ALL);

  useEffect(() => {
    setRelatedFilter(RELATED_FILTER_ALL);
  }, [auditRecord?.request_id, visible]);

  const relatedFilters = useMemo(() => {
    const records = Array.isArray(auditRecord?.related_records)
      ? auditRecord.related_records
      : [];
    const counters = new Map([[RELATED_FILTER_ALL, records.length]]);
    records.forEach((record) => {
      const category = getRelatedCategory(record.route_group);
      counters.set(category, (counters.get(category) || 0) + 1);
    });
    return Array.from(counters.entries()).map(([key, count]) => ({
      key,
      count,
      label: getRelatedCategoryLabel(key, t),
    }));
  }, [auditRecord?.related_records, t]);

  const filteredRelatedRecords = useMemo(() => {
    const records = Array.isArray(auditRecord?.related_records)
      ? auditRecord.related_records
      : [];
    if (relatedFilter === RELATED_FILTER_ALL) {
      return records;
    }
    return records.filter(
      (record) => getRelatedCategory(record.route_group) === relatedFilter,
    );
  }, [auditRecord?.related_records, relatedFilter]);

  const handleCopySection = async (label, value) => {
    const content = stringifyValue(value);
    if (!content) {
      showError(t('当前没有可复制的内容'));
      return;
    }
    if (await copy(content)) {
      showSuccess(`${t('已复制')} ${label}`);
      return;
    }
    showError(t('复制失败，请手动复制'));
  };

  const requestDetails = auditRecord
    ? [
        {
          key: t('Request ID'),
          value: renderTextValue(auditRecord.request_id, true),
        },
        { key: t('用户'), value: renderTextValue(auditRecord.username) },
        { key: t('分组'), value: auditRecord.group || '-' },
        { key: t('路由类型'), value: auditRecord.route_group || '-' },
        { key: t('请求路径'), value: renderTextValue(auditRecord.route_path) },
        { key: t('请求方法'), value: renderTextValue(auditRecord.method) },
        {
          key: t('状态码'),
          value: renderTextValue(auditRecord.status_code ?? '-'),
        },
        { key: t('成功'), value: renderBooleanTag(auditRecord.success, t) },
        {
          key: t('创建时间'),
          value: renderTextValue(formatAuditTimestamp(auditRecord.created_at)),
        },
        {
          key: t('开始时间'),
          value: renderTextValue(formatAuditTimestamp(auditRecord.started_at)),
        },
        {
          key: t('结束时间'),
          value: renderTextValue(formatAuditTimestamp(auditRecord.finished_at)),
        },
      ]
    : [];

  const relayDetails = auditRecord
    ? [
        { key: t('模式'), value: renderTextValue(auditRecord.mode) },
        { key: t('模型'), value: renderTextValue(auditRecord.model_name) },
        {
          key: t('上游模型'),
          value: renderTextValue(auditRecord.upstream_model_name),
        },
        {
          key: t('模型映射'),
          value: renderTextValue(getModelMappingValue(auditRecord, t)),
        },
        {
          key: t('Relay 格式'),
          value: renderTextValue(auditRecord.relay_format),
        },
        {
          key: t('Relay 模式'),
          value: renderTextValue(auditRecord.relay_mode),
        },
        { key: t('渠道'), value: renderTextValue(auditRecord.channel_name) },
        { key: t('令牌'), value: renderTextValue(auditRecord.token_name) },
        { key: t('任务ID'), value: renderTextValue(auditRecord.task_id) },
        { key: t('MjID'), value: renderTextValue(auditRecord.mj_id) },
        {
          key: t('流式'),
          value: renderBooleanTag(auditRecord.is_stream, t, t('流式'), t('非流')),
        },
        {
          key: t('Playground'),
          value: renderBooleanTag(auditRecord.is_playground, t),
        },
      ]
    : [];

  const aggregatedText = getAuditAggregatedText(auditRecord);

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag color='blue' shape='circle'>
            {t('审计')}
          </Tag>
          <div style={{ minWidth: 0 }}>
            <Typography.Text strong>{t('请求审计详情')}</Typography.Text>
            {auditRecord?.route_path ? (
              <Typography.Text
                type='secondary'
                size='small'
                style={{
                  display: 'block',
                  marginTop: 2,
                  wordBreak: 'break-all',
                }}
              >
                {auditRecord.route_path}
              </Typography.Text>
            ) : null}
          </div>
        </div>
      }
      visible={visible}
      onCancel={onCancel}
      footer={null}
      width='min(1120px, calc(100vw - 32px))'
      bodyStyle={{
        maxHeight: 'calc(78vh - 96px)',
        overflowY: 'auto',
        paddingTop: 8,
        paddingBottom: 12,
      }}
      centered
    >
      <Spin spinning={loading}>
        {!auditRecord ? (
          <Empty description={t('暂无审计详情')} image={null} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SectionPanel
              title={t('请求概览')}
              subtitle={t('快速查看本次审计的路由、状态与关键指标')}
              extra={
                <Space wrap>
                  <Button
                    size='small'
                    type='tertiary'
                    onClick={() =>
                      handleCopySection(t('请求 ID'), auditRecord.request_id || '')
                    }
                  >
                    {t('复制 Request ID')}
                  </Button>
                  <Button
                    size='small'
                    type='tertiary'
                    onClick={() =>
                      handleCopySection(t('请求内容'), auditRecord.request)
                    }
                  >
                    {t('复制请求')}
                  </Button>
                  <Button
                    size='small'
                    type='tertiary'
                    onClick={() =>
                      handleCopySection(t('响应内容'), auditRecord.response)
                    }
                  >
                    {t('复制响应')}
                  </Button>
                  <Button
                    size='small'
                    type='tertiary'
                    onClick={() =>
                      handleCopySection(t('链路内容'), auditRecord.trace)
                    }
                  >
                    {t('复制链路')}
                  </Button>
                </Space>
              }
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <Space wrap>
                    {renderStatusTag(auditRecord, t)}
                    {auditRecord.method ? (
                      <Tag color='blue' shape='circle'>
                        {auditRecord.method}
                      </Tag>
                    ) : null}
                    {auditRecord.mode ? (
                      <Tag color='cyan' shape='circle'>
                        {auditRecord.mode}
                      </Tag>
                    ) : null}
                    {auditRecord.route_group ? (
                      <Tag color='white' shape='circle'>
                        {auditRecord.route_group}
                      </Tag>
                    ) : null}
                    {renderBooleanTag(
                      auditRecord.is_stream,
                      t,
                      t('流式'),
                      t('非流'),
                    )}
                    {auditRecord.is_playground ? (
                      <Tag color='violet' shape='circle'>
                        Playground
                      </Tag>
                    ) : null}
                  </Space>
                  <div
                    style={{
                      marginTop: 12,
                      padding: '12px 14px',
                      borderRadius: 14,
                      border: '1px solid var(--semi-color-border)',
                      background: 'var(--semi-color-fill-0)',
                    }}
                  >
                    <Typography.Text
                      strong
                      style={{
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
                        wordBreak: 'break-all',
                      }}
                    >
                      {auditRecord.request_id || '-'}
                    </Typography.Text>
                  </div>
                  <Typography.Text
                    type='secondary'
                    style={{
                      display: 'block',
                      marginTop: 10,
                      wordBreak: 'break-all',
                    }}
                  >
                    {auditRecord.route_path || '-'}
                  </Typography.Text>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 12,
                  }}
                >
                  <MetricCard
                    label={t('总耗时')}
                    value={formatDurationMs(auditRecord.latency_ms)}
                    extra={`${t('重试次数')}：${auditRecord.retry_count || 0}`}
                  />
                  <MetricCard
                    label={t('首包耗时')}
                    value={formatDurationMs(auditRecord.first_response_ms, true)}
                    extra={`${t('开始时间')}：${formatAuditTimestamp(auditRecord.started_at)}`}
                  />
                  <MetricCard
                    label={t('模型映射')}
                    value={getModelMappingValue(auditRecord, t)}
                    extra={`${t('上游模型')}：${auditRecord.upstream_model_name || '-'}`}
                  />
                  <MetricCard
                    label={t('创建时间')}
                    value={formatAuditTimestamp(auditRecord.created_at)}
                    extra={`${t('结束时间')}：${formatAuditTimestamp(auditRecord.finished_at)}`}
                  />
                </div>
              </div>
            </SectionPanel>

            {aggregatedText ? (
              <SectionPanel
                title={t('回答内容')}
                extra={
                  <Button
                    size='small'
                    type='tertiary'
                    onClick={() => handleCopySection(t('回答内容'), aggregatedText)}
                  >
                    {`${t('复制')} ${t('回答内容')}`}
                  </Button>
                }
              >
                <div
                  style={{
                    border: '1px solid var(--semi-color-border)',
                    borderRadius: 14,
                    background: 'var(--semi-color-fill-0)',
                    padding: '14px 16px',
                    maxHeight: 'min(28vh, 320px)',
                    overflowY: 'auto',
                  }}
                >
                  <Typography.Paragraph
                    style={{
                      marginBottom: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      lineHeight: 1.8,
                      fontSize: 14,
                    }}
                  >
                    {aggregatedText}
                  </Typography.Paragraph>
                </div>
              </SectionPanel>
            ) : null}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: 16,
              }}
            >
              <SectionPanel
                title={t('基础信息')}
                subtitle={t('请求、时间与基础状态字段')}
              >
                <Descriptions data={requestDetails} columns={1} />
              </SectionPanel>
              <SectionPanel
                title={t('链路信息')}
                subtitle={t('模型、渠道、令牌与任务定位信息')}
              >
                <Descriptions data={relayDetails} columns={1} />
              </SectionPanel>
            </div>

            {Array.isArray(auditRecord.related_records) &&
            auditRecord.related_records.length > 0 ? (
              <SectionPanel
                title={t('关联请求')}
                subtitle={t('查看同一任务或同一流程中的其他审计记录')}
              >
                <Space wrap style={{ marginBottom: 8 }}>
                  {relatedFilters.map((filter) => (
                    <Button
                      key={filter.key}
                      size='small'
                      type={
                        relatedFilter === filter.key ? 'primary' : 'tertiary'
                      }
                      onClick={() => setRelatedFilter(filter.key)}
                    >
                      {`${filter.label} (${filter.count})`}
                    </Button>
                  ))}
                </Space>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 8,
                  }}
                >
                  {filteredRelatedRecords.map((record) => (
                    <Button
                      key={record.request_id}
                      size='small'
                      type={
                        record.request_id === auditRecord.request_id
                          ? 'primary'
                          : 'tertiary'
                      }
                      disabled={
                        !onOpenRequestAudit ||
                        record.request_id === auditRecord.request_id
                      }
                      style={{
                        justifyContent: 'flex-start',
                        height: 'auto',
                        padding: '10px 12px',
                        whiteSpace: 'normal',
                      }}
                      onClick={() => onOpenRequestAudit?.(record.request_id)}
                    >
                      <div style={{ textAlign: 'left', lineHeight: 1.5 }}>
                        <div style={{ fontWeight: 600 }}>
                          {renderRelatedTitle(record, t)}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--semi-color-text-2)',
                            marginTop: 2,
                            wordBreak: 'break-all',
                          }}
                        >
                          {formatAuditTimestamp(record.created_at)}
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              </SectionPanel>
            ) : null}
            <SectionPanel
              title={t('请求详情')}
              subtitle={t('以结构化 JSON 视图查看请求、响应与链路原始内容')}
            >
              <Tabs type='card'>
                <TabPane tab={t('请求')} itemKey='request'>
                  <JsonBlock value={auditRecord.request} t={t} />
                </TabPane>
                <TabPane tab={t('响应')} itemKey='response'>
                  <JsonBlock value={auditRecord.response} t={t} />
                </TabPane>
                <TabPane tab={t('链路')} itemKey='trace'>
                  <JsonBlock value={auditRecord.trace} t={t} />
                </TabPane>
                <TabPane tab={t('原始概览')} itemKey='summary'>
                  <Typography.Text
                    type='tertiary'
                    style={{ display: 'block', marginBottom: 12 }}
                  >
                    {t('以下内容为审计记录的基础字段快照')}
                  </Typography.Text>
                  <JsonBlock
                    t={t}
                    value={{
                      request_id: auditRecord.request_id,
                      route_group: auditRecord.route_group,
                      route_path: auditRecord.route_path,
                      method: auditRecord.method,
                      status_code: auditRecord.status_code,
                      success: auditRecord.success,
                      relay_format: auditRecord.relay_format,
                      relay_mode: auditRecord.relay_mode,
                      model_name: auditRecord.model_name,
                      upstream_model_name: auditRecord.upstream_model_name,
                      group: auditRecord.group,
                      token_id: auditRecord.token_id,
                      token_name: auditRecord.token_name,
                      channel_id: auditRecord.channel_id,
                      channel_name: auditRecord.channel_name,
                      channel_type: auditRecord.channel_type,
                      task_id: auditRecord.task_id,
                      mj_id: auditRecord.mj_id,
                      latency_ms: auditRecord.latency_ms,
                      first_response_ms: auditRecord.first_response_ms,
                      retry_count: auditRecord.retry_count,
                    }}
                  />
                </TabPane>
              </Tabs>
            </SectionPanel>
          </div>
        )}
      </Spin>
    </Modal>
  );
};

export default RequestAuditModal;
