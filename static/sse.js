// SPDX-License-Identifier: MIT
// This file is written by DeepSeek model.

async function postSSE(url, body, { onEvent, signal } = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) {
    console.warn('响应 Content-Type 不是 text/event-stream:', contentType);
  }

  if (!res.body) {
    throw new Error('当前环境不支持流式响应体');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');

    // SSE 事件之间用空行分隔，即 \n\n
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      const evt = parseSSEEvent(rawEvent);
      if (evt) onEvent?.(evt);
    }
  }

  // 处理最后残留的数据
  buffer += decoder.decode();
  buffer = buffer.replace(/\r\n/g, '\n');
  if (buffer.trim()) {
    const evt = parseSSEEvent(buffer);
    if (evt) onEvent?.(evt);
  }
}

function parseSSEEvent(raw) {
  let event = 'message';
  const dataLines = [];
  let id;
  let retry;

  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(':')) continue; // 注释/心跳

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);

    // 规范：冒号后如果有一个空格，去掉一个
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'event') {
      event = value;
    } else if (field === 'data') {
      dataLines.push(value);
    } else if (field === 'id') {
      id = value;
    } else if (field === 'retry') {
      const n = parseInt(value, 10);
      if (!Number.isNaN(n)) retry = n;
    }
  }

  if (dataLines.length === 0) return null;

  return {
    event,
    data: dataLines.join('\n'),
    id,
    retry,
  };
}