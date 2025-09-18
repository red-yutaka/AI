(() => {
  const DEFAULT_ENDPOINT = 'http://localhost:8000/query';
  const HISTORY_KEY = 'rag-ui-history';
  const SETTINGS_KEY = 'rag-ui-settings';

  const endpointInput = document.getElementById('endpointUrl');
  const streamingToggle = document.getElementById('useStreaming');
  const mockToggle = document.getElementById('useMock');
  const clearButton = document.getElementById('clearHistory');
  const messageList = document.getElementById('messageList');
  const questionInput = document.getElementById('questionInput');
  const sendButton = document.getElementById('sendButton');
  const statusText = document.getElementById('statusText');

  let messages = [];

  function setStatus(text) {
    statusText.textContent = text;
  }

  function setSending(isSending) {
    sendButton.disabled = isSending;
    questionInput.readOnly = isSending;
    sendButton.textContent = isSending ? '送信中…' : '送信';
  }

  function sanitizeSources(rawSources) {
    if (!Array.isArray(rawSources)) {
      return [];
    }
    return rawSources
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const title = typeof item.title === 'string' ? item.title : '';
        const url = typeof item.url === 'string' ? item.url : '';
        return { title, url };
      })
      .filter(Boolean);
  }

  function saveHistory() {
    try {
      const payload = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        sources: sanitizeSources(msg.sources),
      }));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('Failed to save history', error);
    }
  }

  function loadHistory() {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (!stored) {
        return;
      }
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        messages = parsed
          .map((msg) => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: typeof msg.content === 'string' ? msg.content : '',
            sources: sanitizeSources(msg.sources),
          }))
          .filter((msg) => typeof msg.content === 'string');
      }
    } catch (error) {
      console.warn('Failed to load history', error);
      messages = [];
    }
  }

  function saveSettings() {
    try {
      const payload = {
        endpoint: endpointInput.value.trim(),
        useStreaming: streamingToggle.checked,
        useMock: mockToggle.checked,
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('Failed to save settings', error);
    }
  }

  function loadSettings() {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (!stored) {
        return;
      }
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.endpoint === 'string' && parsed.endpoint.trim()) {
          endpointInput.value = parsed.endpoint.trim();
        }
        streamingToggle.checked = Boolean(parsed.useStreaming);
        if (typeof parsed.useMock === 'boolean') {
          mockToggle.checked = parsed.useMock;
        }
      }
    } catch (error) {
      console.warn('Failed to load settings', error);
    }
  }

  function sanitizeUrl(url) {
    if (typeof url !== 'string' || !url) {
      return '';
    }
    try {
      const parsed = new URL(url, window.location.origin);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href;
      }
      return '';
    } catch (error) {
      return '';
    }
  }

  function renderMessages() {
    messageList.innerHTML = '';

    if (messages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'まだメッセージがありません。質問を送信して会話を始めましょう。';
      messageList.appendChild(empty);
      return;
    }

    messages.forEach((msg) => {
      const wrapper = document.createElement('article');
      wrapper.className = `message ${msg.role}`;

      const roleLabel = document.createElement('div');
      roleLabel.className = 'role';
      roleLabel.textContent = msg.role === 'user' ? 'ユーザー' : 'アシスタント';
      wrapper.appendChild(roleLabel);

      const content = document.createElement('div');
      content.className = 'content';
      content.textContent = msg.content || '';
      wrapper.appendChild(content);

      const sources = sanitizeSources(msg.sources);
      if (sources.length > 0) {
        const sourceList = document.createElement('ul');
        sourceList.className = 'sources';
        sources.forEach((source, index) => {
          const item = document.createElement('li');
          const safeUrl = sanitizeUrl(source.url);
          const title = source.title && source.title.trim() ? source.title.trim() : `Source ${index + 1}`;
          if (safeUrl) {
            const anchor = document.createElement('a');
            anchor.href = safeUrl;
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
            anchor.textContent = title;
            item.appendChild(anchor);
          } else {
            item.textContent = title;
          }
          sourceList.appendChild(item);
        });
        wrapper.appendChild(sourceList);
      }

      messageList.appendChild(wrapper);
    });

    messageList.scrollTop = messageList.scrollHeight;
  }

  function addMessage(role, content, sources = []) {
    const message = {
      role,
      content,
      sources: sanitizeSources(sources),
    };
    messages.push(message);
    renderMessages();
    saveHistory();
    return message;
  }

  function updateHistory() {
    renderMessages();
    saveHistory();
  }

  function buildStreamUrl(baseUrl, query) {
    if (!baseUrl || typeof baseUrl !== 'string') {
      return `/stream?q=${encodeURIComponent(query)}`;
    }
    try {
      const url = new URL(baseUrl);
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length > 0) {
        segments[segments.length - 1] = 'stream';
      } else {
        segments.push('stream');
      }
      url.pathname = `/${segments.join('/')}`;
      url.searchParams.set('q', query);
      return url.toString();
    } catch (error) {
      const trimmed = baseUrl.replace(/\/+$/, '');
      return `${trimmed}/stream?q=${encodeURIComponent(query)}`;
    }
  }

  function createMockResponse(question) {
    const answer = `これはモック応答です。「${question}」についてのダミー回答を表示しています。`;
    const sources = [
      {
        title: 'ダミーソース 1',
        url: 'https://example.com/source-1',
      },
      {
        title: 'ダミーソース 2',
        url: 'https://example.com/source-2',
      },
    ];
    return { answer, sources };
  }

  function handleMockResponse(question) {
    setStatus('モック応答生成中…');
    return new Promise((resolve) => {
      setTimeout(() => {
        const mock = createMockResponse(question);
        addMessage('assistant', mock.answer, mock.sources);
        setStatus('モック応答完了');
        resolve();
      }, 500);
    });
  }

  async function handleNonStreamingRequest(endpoint, question) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: question }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const answer = typeof data.answer === 'string' ? data.answer : '';
      const sources = Array.isArray(data.sources) ? data.sources : [];
      addMessage('assistant', answer, sources);
      setStatus('完了');
    } catch (error) {
      console.error(error);
      addMessage('assistant', `エラーが発生しました: ${error.message}`);
      setStatus('エラーが発生しました');
    }
  }

  function handleStreamingRequest(endpoint, question) {
    if (!('EventSource' in window)) {
      addMessage('assistant', 'ブラウザがSSE (EventSource) に対応していません。');
      setStatus('SSE非対応');
      return Promise.resolve();
    }

    const streamUrl = buildStreamUrl(endpoint, question);
    setStatus('ストリーム接続中…');

    return new Promise((resolve) => {
      const assistantMessage = addMessage('assistant', '');
      let closed = false;

      const eventSource = new EventSource(streamUrl);

      eventSource.onmessage = (event) => {
        if (!event.data) {
          return;
        }
        try {
          const payload = JSON.parse(event.data);
          if (typeof payload.delta === 'string') {
            assistantMessage.content += payload.delta;
          }
          if (Array.isArray(payload.sources) && payload.sources.length) {
            assistantMessage.sources = sanitizeSources(payload.sources);
          }
          updateHistory();
          if (payload.done) {
            finish('完了');
          }
        } catch (error) {
          console.warn('ストリームの解析に失敗しました', error);
        }
      };

      eventSource.onerror = () => {
        if (closed) {
          return;
        }
        assistantMessage.content = assistantMessage.content || 'ストリームの受信中にエラーが発生しました。';
        updateHistory();
        finish('ストリームエラー');
      };

      function finish(statusMessage) {
        if (closed) {
          return;
        }
        closed = true;
        eventSource.close();
        setStatus(statusMessage);
        resolve();
      }
    });
  }

  async function handleSend() {
    const question = questionInput.value.trim();
    if (!question) {
      return;
    }

    addMessage('user', question);
    questionInput.value = '';
    questionInput.focus();

    setSending(true);
    setStatus('送信中…');
    saveSettings();

    const endpoint = endpointInput.value.trim() || DEFAULT_ENDPOINT;
    const useMock = mockToggle.checked;
    const useStreaming = streamingToggle.checked;

    try {
      if (useMock) {
        await handleMockResponse(question);
      } else if (useStreaming) {
        await handleStreamingRequest(endpoint, question);
      } else {
        await handleNonStreamingRequest(endpoint, question);
      }
    } finally {
      setSending(false);
      questionInput.focus();
    }
  }

  clearButton.addEventListener('click', () => {
    messages = [];
    saveHistory();
    renderMessages();
    setStatus('履歴をクリアしました');
  });

  sendButton.addEventListener('click', handleSend);

  questionInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!sendButton.disabled) {
        handleSend();
      }
    }
  });

  endpointInput.addEventListener('change', saveSettings);
  streamingToggle.addEventListener('change', saveSettings);
  mockToggle.addEventListener('change', saveSettings);

  loadSettings();
  loadHistory();
  renderMessages();
})();
