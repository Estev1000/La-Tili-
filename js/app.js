/* =============================================================
   La Tili · Cliente 100% navegador
   Supabase (Postgres + Auth + Realtime) — sin servidor Node
   ============================================================= */

(function () {
  'use strict';

  // -------------------------------------------------------------
  // Config
  // -------------------------------------------------------------
  const SUPABASE_URL = window.SUPABASE_URL;
  const ANON_KEY = window.SUPABASE_ANON_KEY;
  const NICK_DOMAIN = window.NICK_EMAIL_DOMAIN || '@latili.app';

  const $ = (sel) => document.querySelector(sel);

  const el = {
    nickWrap: $('#nickWrap'),
    contentWrap: $('#contentWrap'),
    nickError: $('#nickError'),
    nickname: $('#nickname'),
    password: $('#password'),
    loginBtn: $('#loginBtn'),
    registerBtn: $('#registerBtn'),
    logoutBtn: $('#logoutBtn'),
    currentUser: $('#currentUser'),
    currentUserNick: $('#currentUserNick'),
    userCount: $('#userCount'),
    chat: $('#chat'),
    messageForm: $('#message-form'),
    message: $('#message'),
    emojiBtn: $('#emoji-btn'),
    usernames: $('#usernames'),
    toggleLiveBtn: $('#toggleLiveBtn'),
    privateMsgUser: $('#privateMsgUser'),
    privateMsgInput: $('#privateMsgInput'),
    sendPrivateMsgBtn: $('#sendPrivateMsgBtn'),
    liveSection: $('#liveStreamSection'),
    liveIndicator: $('#liveIndicator'),
    liveHostLabel: $('#liveHostLabel'),
    startLiveBtn: $('#startLiveBtn'),
    stopLiveBtn: $('#stopLiveBtn'),
    localVideo: $('#localVideo'),
    localVideoOverlay: $('#localVideoOverlay'),
    remoteVideo: $('#remoteVideo'),
    remoteVideoOverlay: $('#remoteVideoOverlay'),
    localVideoCol: $('#localVideoCol'),
    remoteVideoCol: $('#remoteVideoCol'),
    liveChat: $('#liveChat'),
    liveMessageForm: $('#live-message-form'),
    liveMessage: $('#liveMessage'),
    closeLiveBtn: $('#closeLiveBtn'),
    copyLink: $('#copyLink'),
    shareInstagram: $('#shareInstagram')
  };

  createParticles();

  if (!window.supabase) {
    fatal('No se pudo cargar el SDK de Supabase. Revisá tu conexión.');
    return;
  }
  if (!SUPABASE_URL || SUPABASE_URL.includes('TU_PROJECT_REF') || !ANON_KEY || ANON_KEY.includes('TU_CLAVE')) {
    fatal('Falta configurar Supabase. Editá <b>js/config.js</b> con la URL del proyecto y la clave anon.');
    return;
  }

  const supabase = window.supabase.createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 20 } }
  });

  // -------------------------------------------------------------
  // Estado
  // -------------------------------------------------------------
  const state = {
    me: null,               // { id, nick }
    room: null,             // canal principal (presence + broadcast + postgres_changes)
    liveRoom: null,         // canal de señalización del live actual
    liveRoomFor: null,      // nick del host al que pertenece liveRoom
    liveRoomReady: null,    // promesa resuelta cuando liveRoom está suscrito
    hostPeers: new Map(),   // nick del espectador -> RTCPeerConnection (solo host)
    watcherPc: null,        // RTCPeerConnection del espectador
    localStream: null,
    isHosting: false,
    watching: null,         // nick del host que se está mirando
    following: new Set(),
    followerCounts: new Map(),
    seenMessages: new Set(),
    watchParam: new URLSearchParams(location.search).get('watch'),
    watchParamChecked: false
  };

  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  };

  // -------------------------------------------------------------
  // Utilidades
  // -------------------------------------------------------------
  function createParticles() {
    const box = $('#particles');
    if (!box) return;
    for (let i = 0; i < 50; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDelay = Math.random() * 6 + 's';
      p.style.animationDuration = Math.random() * 3 + 3 + 's';
      box.appendChild(p);
    }
  }

  function fatal(html) {
    if (!el.nickError) return;
    el.nickError.innerHTML = `<div class="alert alert-danger">${html}</div>`;
  }

  function alertBox(kind, text) {
    if (el.nickError) {
      el.nickError.innerHTML = `<div class="alert alert-${kind}">${escapeHtml(text)}</div>`;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function nickToEmail(nick) {
    return nick + NICK_DOMAIN;
  }

  function emailToNick(email) {
    return String(email || '').split('@')[0];
  }

  function validNick(nick) {
    return /^[a-zA-Z0-9_]{3,20}$/.test(nick);
  }

  function scrollToBottom(node) {
    node.scrollTop = node.scrollHeight;
  }

  function systemMsg(text) {
    if (!el.chat) return;
    const div = document.createElement('div');
    div.className = 'chat-msg p-2 mb-1 text-white-50 small';
    div.innerHTML = `<i class="fas fa-info-circle me-1"></i>${escapeHtml(text)}`;
    el.chat.appendChild(div);
    scrollToBottom(el.chat);
  }

  function authErrorText(err) {
    const raw = (err && (err.message || err.error_description || err.msg)) || '';
    const low = raw.toLowerCase();
    if (low.includes('invalid login credentials')) return 'Credenciales incorrectas.';
    if (low.includes('user already registered')) return 'El apodo ya existe.';
    if (low.includes('email not confirmed')) {
      return 'Falta confirmar el email. En Supabase > Authentication > Providers, desactivá "Confirm email" para este chat.';
    }
    if (low.includes('rate limit')) return 'Demasiados intentos. Esperá un momento.';
    return raw || 'Error inesperado. Revisá la consola.';
  }

  // -------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------
  function readCreds() {
    const nick = el.nickname.value.trim();
    const pass = el.password.value;
    if (!nick || !pass) {
      alertBox('danger', 'Completá usuario y contraseña.');
      return null;
    }
    if (!validNick(nick)) {
      alertBox('danger', 'El usuario debe tener 3 a 20 caracteres: letras, números o guion bajo.');
      return null;
    }
    if (pass.length < 6) {
      alertBox('danger', 'La contraseña debe tener al menos 6 caracteres.');
      return null;
    }
    return { nick, pass };
  }

  el.registerBtn.addEventListener('click', async () => {
    const creds = readCreds();
    if (!creds) return;
    el.registerBtn.disabled = true;
    alertBox('info', 'Creando cuenta...');
    try {
      const { data, error } = await supabase.auth.signUp({
        email: nickToEmail(creds.nick),
        password: creds.pass,
        options: { data: { nick: creds.nick } }
      });
      if (error) throw error;
      if (data.session) {
        await enterChat(data.user);
        return;
      }
      // Confirmación de email activada: intentamos entrar igual
      const retry = await supabase.auth.signInWithPassword({
        email: nickToEmail(creds.nick),
        password: creds.pass
      });
      if (retry.error) throw retry.error;
      await enterChat(retry.data.user);
    } catch (err) {
      alertBox('danger', authErrorText(err));
    } finally {
      el.registerBtn.disabled = false;
    }
  });

  el.loginBtn.addEventListener('click', async () => {
    const creds = readCreds();
    if (!creds) return;
    el.loginBtn.disabled = true;
    alertBox('info', 'Iniciando sesión...');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: nickToEmail(creds.nick),
        password: creds.pass
      });
      if (error) throw error;
      await enterChat(data.user);
    } catch (err) {
      alertBox('danger', authErrorText(err));
    } finally {
      el.loginBtn.disabled = false;
    }
  });

  el.logoutBtn.addEventListener('click', async () => {
    if (!confirm('¿Cerrar sesión?')) return;
    await supabase.auth.signOut();
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      if (state.me && confirm('¿Cerrar sesión?')) supabase.auth.signOut();
    }
  });

  supabase.auth.onAuthStateChange((event, session) => {
    // Se ejecuta fuera del callback para evitar bloqueos del cliente
    setTimeout(async () => {
      if (event === 'SIGNED_OUT' || !session) {
        leaveChat();
      } else if (!state.me && event !== 'TOKEN_REFRESHED') {
        await enterChat(session.user);
      }
    }, 0);
  });

  supabase.auth.getSession().then(({ data }) => {
    if (data.session) enterChat(data.user);
  });

  // -------------------------------------------------------------
  // Entrada / salida
  // -------------------------------------------------------------
  async function enterChat(user) {
    const nick = (user.user_metadata && user.user_metadata.nick) || emailToNick(user.email);
    state.me = { id: user.id, nick, isAdmin: false };

    // Marca de administrador (puede borrar mensajes ajenos)
    const { data: perfil } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();
    if (perfil) state.me.isAdmin = !!perfil.is_admin;

    el.nickWrap.style.display = 'none';
    el.contentWrap.style.display = 'flex';
    el.currentUser.classList.remove('d-none');
    el.currentUserNick.textContent = nick;
    el.logoutBtn.classList.remove('d-none');
    el.nickError.innerHTML = '';
    el.message.focus();

    await joinRoom();
    await Promise.all([loadMessages(), loadFollowing(), loadFollowerCounts()]);
    renderUsers();
    systemMsg(`Bienvenido/a, ${nick}!`);
  }

  function leaveChat() {
    if (state.isHosting) stopLive(true);
    if (state.watching) closeLiveView();

    if (state.room) {
      supabase.removeChannel(state.room);
      state.room = null;
    }
    if (state.liveRoom) {
      supabase.removeChannel(state.liveRoom);
      state.liveRoom = null;
      state.liveRoomFor = null;
      state.liveRoomReady = null;
    }

    state.me = null;
    state.watching = null;
    state.hostPeers.clear();
    state.following.clear();
    state.followerCounts.clear();
    state.seenMessages.clear();
    state.watchParamChecked = false;

    if (el.chat) el.chat.innerHTML = '';
    if (el.usernames) el.usernames.innerHTML = '';
    if (el.userCount) el.userCount.textContent = '0';
    if (el.liveChat) el.liveChat.innerHTML = '';

    el.contentWrap.style.display = 'none';
    el.nickWrap.style.display = '';
    el.currentUser.classList.add('d-none');
    el.logoutBtn.classList.add('d-none');
  }

  // -------------------------------------------------------------
  // Canal principal: presencia + broadcast + postgres_changes
  // -------------------------------------------------------------
  async function joinRoom() {
    const room = supabase.channel('chat-room', {
      config: { presence: { key: state.me.nick }, broadcast: { self: false } }
    });

    room.on('presence', { event: 'sync' }, renderUsers);
    room.on('presence', { event: 'join' }, renderUsers);
    room.on('presence', { event: 'leave' }, renderUsers);

    room.on('broadcast', { event: 'whisper' }, ({ payload }) => {
      if (payload.to !== state.me.nick) return;
      const div = document.createElement('div');
      div.className = 'chat-msg p-2 mb-1 w-75 whisper';
      div.innerHTML = `<span class="msg-text"><b>${escapeHtml(payload.from)}</b>: ${escapeHtml(payload.msg)}</span>`;
      el.chat.appendChild(div);
      scrollToBottom(el.chat);
    });

    room.on('broadcast', { event: 'live-comment' }, ({ payload }) => {
      if (payload.host === state.watching || payload.host === state.me.nick) {
        appendLiveMsg(payload);
      }
    });

    room.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      ({ new: row }) => appendMessage(row)
    );
    room.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages' },
      ({ new: row }) => patchMessage(row)
    );
    room.on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'messages' },
      ({ old: row }) => {
        const node = document.getElementById(`msgdb-${row.id}`);
        if (node) node.remove();
        state.seenMessages.delete(row.id);
      }
    );
    room.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'followers' },
      () => loadFollowerCounts()
    );

    room.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await room.track({ nick: state.me.nick, live: false });
      }
    });

    state.room = room;
  }

  function presenceList() {
    if (!state.room) return [];
    const raw = state.room.presenceState() || {};
    const out = [];
    Object.values(raw).forEach((entries) => {
      if (Array.isArray(entries)) {
        entries.forEach((e) => { if (e && e.nick) out.push(e); });
      } else if (entries && entries.nick) {
        out.push(entries);
      }
    });
    return out;
  }

  function isOnline(nick) {
    return presenceList().some((p) => p.nick === nick);
  }

  // -------------------------------------------------------------
  // Lista de usuarios
  // -------------------------------------------------------------
  function renderUsers() {
    if (!state.me || !el.usernames) return;
    const users = presenceList();
    el.userCount.textContent = users.length;

    const html = users
      .map((u) => {
        const isMe = u.nick === state.me.nick;
        const following = state.following.has(u.nick);
        const count = state.followerCounts.get(u.nick) || 0;
        const live = u.live
          ? '<span class="pulse-ring bg-danger rounded-circle ms-2" style="display:inline-block;width:12px;height:12px;"></span>'
          : '';
        const followBtn = isMe
          ? ''
          : `<button type="button" class="btn btn-sm ${following ? 'btn-success' : 'btn-outline-light'} ms-2 follow-btn" data-user="${escapeHtml(u.nick)}">${following ? 'Siguiendo' : 'Seguir'}</button>`;
        return `<div class="user-item chat-bubble rounded-3 p-2 mb-2 d-flex align-items-center gap-2" data-user="${escapeHtml(u.nick)}">
            <div class="user-avatar">${escapeHtml(u.nick.charAt(0).toUpperCase())}</div>
            <span class="fw-semibold text-white">${escapeHtml(u.nick)}</span>
            ${live}
            ${followBtn}
            <span class="badge bg-secondary ms-auto followers-count" data-user="${escapeHtml(u.nick)}">${count} seg.</span>
          </div>`;
      })
      .join('');

    el.usernames.innerHTML = html || '<p class="text-white-50 mb-0">No hay usuarios conectados.</p>';

    maybeAutoWatch(users);
  }

  function maybeAutoWatch(users) {
    if (state.watchParamChecked || !state.watchParam) return;
    const host = users.find((u) => u.nick === state.watchParam);
    if (!host) return;
    state.watchParamChecked = true;
    if (host.live) {
      startWatching(host.nick);
    } else {
      systemMsg(`${host.nick} no está transmitiendo en este momento.`);
    }
  }

  // -------------------------------------------------------------
  // Mensajes
  // -------------------------------------------------------------
  async function loadMessages() {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) {
      systemMsg('No se pudieron cargar los mensajes: ' + error.message);
      return;
    }
    (data || []).forEach((row) => appendMessage(row, true));
  }

  function appendMessage(row, silent) {
    if (!row || row.kind !== 'global') return;
    if (state.seenMessages.has(row.id)) return;
    state.seenMessages.add(row.id);

    const isOwn = row.user_id === state.me.id;
    const isAdmin = !!state.me.isAdmin;
    const actions = (isOwn || isAdmin)
      ? `<span class="ms-auto">
           ${isOwn ? `<button type="button" class="btn btn-sm btn-warning edit-msg-btn ms-1" data-id="${row.id}">✏️</button>` : ''}
           <button type="button" class="btn btn-sm btn-danger delete-msg-btn ms-1" data-id="${row.id}" data-mod="${isOwn ? '0' : '1'}">🗑️</button>
         </span>`
      : '';

    const div = document.createElement('div');
    div.className = 'chat-msg p-2 bg-secondary w-75 animate__animated animate__backInUp mb-1 d-flex align-items-center';
    div.id = `msgdb-${row.id}`;
    div.innerHTML = `<span class="msg-text"><b>${escapeHtml(row.nick)}</b>: ${escapeHtml(row.msg)}</span> ${actions}`;

    el.chat.appendChild(div);
    if (!silent) scrollToBottom(el.chat);
    else scrollToBottom(el.chat);
  }

  function patchMessage(row) {
    const node = document.getElementById(`msgdb-${row.id}`);
    if (!node) return;
    const text = node.querySelector('.msg-text');
    if (text) text.innerHTML = `<b>${escapeHtml(row.nick)}</b>: ${escapeHtml(row.msg)}`;
  }

  el.messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = el.message.value.trim();
    if (!raw) return;

    if (raw.startsWith('/w ')) {
      const rest = raw.slice(3);
      const idx = rest.indexOf(' ');
      if (idx === -1) {
        systemMsg('Uso: /w apodo mensaje');
      } else {
        sendWhisper(rest.slice(0, idx), rest.slice(idx + 1).trim());
      }
      el.message.value = '';
      return;
    }

    el.message.value = '';
    const { error } = await supabase.from('messages').insert({
      user_id: state.me.id,
      nick: state.me.nick,
      msg: raw
    });
    if (error) {
      // Si lo frenó el anti-spam, el texto vuelve al campo para no perderlo
      el.message.value = raw;
      el.message.focus();
      systemMsg('No se pudo enviar: ' + error.message);
    }
  });

  el.chat.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.edit-msg-btn');
    if (editBtn) {
      const id = editBtn.dataset.id;
      const node = document.getElementById(`msgdb-${id}`);
      const current = node.querySelector('.msg-text').textContent.split(': ').slice(1).join(': ');
      const value = prompt('Editar mensaje:', current);
      if (value === null || !value.trim() || value === current) return;
      const { error } = await supabase
        .from('messages')
        .update({ msg: value.trim() })
        .eq('id', id)
        .eq('user_id', state.me.id);
      if (error) systemMsg('No se pudo editar: ' + error.message);
      return;
    }

    const delBtn = e.target.closest('.delete-msg-btn');
    if (delBtn) {
      const mod = delBtn.dataset.mod === '1';
      const pregunta = mod
        ? 'Como moderador, ¿eliminar este mensaje de otro usuario?'
        : '¿Eliminar este mensaje?';
      if (!confirm(pregunta)) return;
      let q = supabase.from('messages').delete().eq('id', delBtn.dataset.id);
      if (!mod) q = q.eq('user_id', state.me.id);
      const { error } = await q;
      if (error) systemMsg('No se pudo eliminar: ' + error.message);
    }
  });

  // -------------------------------------------------------------
  // Mensajes privados
  // -------------------------------------------------------------
  function sendWhisper(to, msg) {
    if (!msg) {
      systemMsg('Escribí un mensaje.');
      return;
    }
    if (to === state.me.nick) {
      systemMsg('No podés enviarte un mensaje a vos mismo.');
      return;
    }
    if (!isOnline(to)) {
      systemMsg(`El usuario ${to} no está conectado.`);
      return;
    }
    state.room.send({
      type: 'broadcast',
      event: 'whisper',
      payload: { from: state.me.nick, to, msg }
    });
  }

  el.usernames.addEventListener('click', (e) => {
    const followBtn = e.target.closest('.follow-btn');
    if (followBtn) {
      e.stopPropagation();
      toggleFollow(followBtn.dataset.user);
      return;
    }
    const item = e.target.closest('.user-item');
    if (!item) return;
    const nick = item.dataset.user;
    if (nick === state.me.nick) return;
    const online = presenceList().find((u) => u.nick === nick);
    if (online && online.live) {
      startWatching(nick);
    } else {
      el.privateMsgUser.textContent = nick;
      el.privateMsgInput.value = '';
      bootstrap.Modal.getOrCreateInstance(document.getElementById('privateMsgModal')).show();
    }
  });

  el.sendPrivateMsgBtn.addEventListener('click', () => {
    const to = el.privateMsgUser.textContent.trim();
    const msg = el.privateMsgInput.value.trim();
    if (!to || !msg) return;
    sendWhisper(to, msg);
    bootstrap.Modal.getInstance(document.getElementById('privateMsgModal'))?.hide();
  });

  // -------------------------------------------------------------
  // Seguidores
  // -------------------------------------------------------------
  async function loadFollowing() {
    const { data } = await supabase
      .from('followers')
      .select('user_id')
      .eq('follower_id', state.me.id);
    const ids = (data || []).map((r) => r.user_id);
    if (!ids.length) {
      state.following = new Set();
      return;
    }
    const { data: profiles } = await supabase.from('profiles').select('id, nick').in('id', ids);
    state.following = new Set((profiles || []).map((p) => p.nick));
  }

  async function loadFollowerCounts() {
    const { data } = await supabase.from('follower_counts').select('nick, followers_count');
    state.followerCounts = new Map((data || []).map((r) => [r.nick, r.followers_count || 0]));
    renderUsers();
  }

  async function toggleFollow(targetNick) {
    if (!state.me) return;
    if (targetNick === state.me.nick) {
      systemMsg('No podés seguirte a vos mismo.');
      return;
    }
    const { data: target, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('nick', targetNick)
      .maybeSingle();
    if (error || !target) {
      systemMsg(`No se encontró el usuario ${targetNick}.`);
      return;
    }

    const isFollowing = state.following.has(targetNick);
    // Feedback inmediato
    if (isFollowing) state.following.delete(targetNick);
    else state.following.add(targetNick);
    renderUsers();

    const res = isFollowing
      ? await supabase.from('followers').delete().eq('user_id', target.id).eq('follower_id', state.me.id)
      : await supabase.from('followers').insert({ user_id: target.id, follower_id: state.me.id });

    if (res.error) {
      // revertimos
      if (isFollowing) state.following.add(targetNick);
      else state.following.delete(targetNick);
      renderUsers();
      systemMsg('No se pudo actualizar el seguimiento: ' + res.error.message);
    }
  }

  // -------------------------------------------------------------
  // Señalización WebRTC (Realtime Broadcast)
  // -------------------------------------------------------------
  function ensureLiveRoom(hostNick) {
    if (state.liveRoom && state.liveRoomFor === hostNick) return state.liveRoomReady;
    if (state.liveRoom) {
      supabase.removeChannel(state.liveRoom);
      state.liveRoom = null;
    }

    const channel = supabase.channel(`live-${hostNick}`, {
      config: { broadcast: { self: false } }
    });

    channel.on('broadcast', { event: 'signal' }, ({ payload }) => onSignal(payload));

    // Se resuelve recién cuando el canal está suscrito: si semandara un
    // broadcast antes, el mensaje se perdería.
    state.liveRoomReady = new Promise((resolve) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve(channel);
      });
    });

    state.liveRoom = channel;
    state.liveRoomFor = hostNick;
    return state.liveRoomReady;
  }

  function sendSignal(payload) {
    if (!state.liveRoom) return;
    state.liveRoom.send({ type: 'broadcast', event: 'signal', payload });
  }

  async function onSignal(msg) {
    if (!msg || !state.me) return;
    const isHost = state.isHosting;

    if (msg.type === 'stop') {
      if (!isHost && state.watching === msg.from) closeLiveView();
      return;
    }

    if (msg.type === 'request' && isHost) {
      const viewer = msg.from;
      if (state.hostPeers.has(viewer)) state.hostPeers.get(viewer).close();
      const pc = new RTCPeerConnection(RTC_CONFIG);
      state.localStream.getTracks().forEach((track) => pc.addTrack(track, state.localStream));
      pc.onicecandidate = (ev) => {
        if (ev.candidate) sendSignal({ type: 'ice', to: viewer, from: state.me.nick, candidate: ev.candidate });
      };
      state.hostPeers.set(viewer, pc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal({ type: 'offer', to: viewer, from: state.me.nick, sdp: pc.localDescription });
      return;
    }

    if (msg.type === 'offer' && isHost) {
      const pc = state.hostPeers.get(msg.from) || new RTCPeerConnection(RTC_CONFIG);
      if (!state.hostPeers.has(msg.from)) {
        state.localStream.getTracks().forEach((track) => pc.addTrack(track, state.localStream));
        pc.onicecandidate = (ev) => {
          if (ev.candidate) sendSignal({ type: 'ice', to: msg.from, from: state.me.nick, candidate: ev.candidate });
        };
        state.hostPeers.set(msg.from, pc);
      }
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal({ type: 'answer', to: msg.from, from: state.me.nick, sdp: pc.localDescription });
      return;
    }

    if (msg.type === 'answer' && isHost) {
      const pc = state.hostPeers.get(msg.from);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      return;
    }

    if (msg.type === 'ice' && isHost) {
      const pc = state.hostPeers.get(msg.from);
      if (pc) {
        try { await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch (_) { /* ignorar */ }
      }
      return;
    }

    // ---- lado espectador ----
    if (msg.type === 'offer' && !isHost) {
      if (state.watcherPc) state.watcherPc.close();
      const pc = new RTCPeerConnection(RTC_CONFIG);
      state.watcherPc = pc;
      pc.ontrack = (ev) => {
        el.remoteVideo.srcObject = ev.streams[0];
        el.remoteVideo.classList.remove('d-none');
      };
      pc.onicecandidate = (ev) => {
        if (ev.candidate) sendSignal({ type: 'ice', to: msg.from, from: state.me.nick, candidate: ev.candidate });
      };
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal({ type: 'answer', to: msg.from, from: state.me.nick, sdp: pc.localDescription });
      return;
    }

    if (msg.type === 'ice' && !isHost) {
      if (state.watcherPc) {
        try { await state.watcherPc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch (_) { /* ignorar */ }
      }
    }
  }

  // -------------------------------------------------------------
  // Live
  // -------------------------------------------------------------
  el.startLiveBtn.addEventListener('click', async () => {
    el.startLiveBtn.disabled = true;
    try {
      state.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (err) {
      el.startLiveBtn.disabled = false;
      systemMsg('No se pudo acceder a la cámara/micrófono: ' + err.message);
      return;
    }

    state.isHosting = true;
    el.localVideo.srcObject = state.localStream;
    el.localVideo.classList.remove('d-none');
    el.localVideoOverlay.classList.add('d-none');
    el.localVideoCol.classList.remove('d-none');
    el.remoteVideoCol.classList.add('d-none');

    el.liveSection.classList.remove('d-none');
    el.contentWrap.style.display = 'none';
    el.liveHostLabel.textContent = 'Estás transmitiendo en vivo';
    el.liveIndicator.classList.remove('d-none');
    el.startLiveBtn.classList.add('d-none');
    el.stopLiveBtn.classList.remove('d-none');
    el.startLiveBtn.disabled = false;

    ensureLiveRoom(state.me.nick).then(() => {
      return state.room.track({ nick: state.me.nick, live: true });
    }).then(() => renderUsers());
    setupShareButtons(state.me.nick);
  });

  el.stopLiveBtn.addEventListener('click', () => stopLive());

  function stopLive(silent) {
    sendSignal({ type: 'stop', from: state.me.nick });
    state.hostPeers.forEach((pc) => pc.close());
    state.hostPeers.clear();
    if (state.localStream) {
      state.localStream.getTracks().forEach((t) => t.stop());
      state.localStream = null;
    }
    el.localVideo.srcObject = null;
    el.localVideo.classList.add('d-none');
    el.localVideoOverlay.classList.remove('d-none');
    el.liveIndicator.classList.add('d-none');

    state.isHosting = false;
    if (state.room) state.room.track({ nick: state.me.nick, live: false });

    el.startLiveBtn.classList.remove('d-none');
    el.stopLiveBtn.classList.add('d-none');
    el.liveSection.classList.add('d-none');
    el.liveSection.style.display = '';
    el.contentWrap.style.display = 'flex';
    el.liveHostLabel.textContent = '';
    renderUsers();
    if (!silent) systemMsg('Detuviste la transmisión.');
  }

  async function startWatching(hostNick) {
    if (!state.me) return;
    if (state.isHosting) return;

    state.watching = hostNick;
    el.liveSection.classList.remove('d-none');
    el.contentWrap.style.display = 'none';
    el.liveHostLabel.textContent = `Transmisión de ${hostNick}`;
    el.liveChat.innerHTML = '';
    el.remoteVideoCol.classList.remove('d-none');
    el.localVideoCol.classList.add('d-none');
    el.remoteVideo.classList.remove('d-none');

    await ensureLiveRoom(hostNick);
    sendSignal({ type: 'request', to: hostNick, from: state.me.nick });
    setupShareButtons(hostNick);

    setTimeout(() => {
      if (state.watching === hostNick && !el.remoteVideo.srcObject) {
        systemMsg('No se pudo conectar con la transmisión. Puede que el host haya detenido la cámara.');
      }
    }, 8000);
  }

  function closeLiveView() {
    if (state.watcherPc) {
      state.watcherPc.close();
      state.watcherPc = null;
    }
    if (el.remoteVideo) el.remoteVideo.srcObject = null;
    if (el.remoteVideo) el.remoteVideo.classList.add('d-none');
    state.watching = null;
    el.liveSection.classList.add('d-none');
    el.liveSection.style.display = '';
    el.contentWrap.style.display = 'flex';
    el.liveHostLabel.textContent = '';
    el.remoteVideoOverlay.classList.add('d-none');
  }

  el.closeLiveBtn.addEventListener('click', () => {
    if (state.isHosting) stopLive();
    else closeLiveView();
  });

  el.toggleLiveBtn.addEventListener('click', () => {
    el.liveSection.classList.remove('d-none');
    el.contentWrap.style.display = 'none';
  });

  el.liveMessageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = el.liveMessage.value.trim();
    const host = state.watching || state.me.nick;
    if (!msg) return;
    state.room.send({
      type: 'broadcast',
      event: 'live-comment',
      payload: { host, from: state.me.nick, message: msg }
    });
    el.liveMessage.value = '';
  });

  function appendLiveMsg(payload) {
    const div = document.createElement('div');
    div.className = 'chat-msg p-2 bg-dark bg-opacity-75 w-100 text-white rounded-3 mb-1 animate__animated animate__fadeInUp';
    div.innerHTML = `<span><b>${escapeHtml(payload.from)}</b>: ${escapeHtml(payload.message)}</span>`;
    el.liveChat.appendChild(div);
    scrollToBottom(el.liveChat);
  }

  // -------------------------------------------------------------
  // Compartir / pantalla completa / emojis
  // -------------------------------------------------------------
  function liveLink(hostNick) {
    const url = new URL(window.location.href);
    url.searchParams.set('watch', hostNick);
    return url.toString();
  }

  function setupShareButtons(hostNick) {
    const link = liveLink(hostNick);
    const text = 'Mira mi directo: ' + link;
    $('#shareWhatsapp').href = `https://wa.me/?text=${encodeURIComponent(text)}`;
    $('#shareFacebook').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;
    $('#shareTwitter').href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    el.copyLink.onclick = async () => {
      try {
        await navigator.clipboard.writeText(link);
        alert('Enlace copiado al portapapeles');
      } catch (_) {
        prompt('Copiá este enlace:', link);
      }
    };
  }

  el.shareInstagram.onclick = async () => {
    const video = !el.remoteVideo.classList.contains('d-none') ? el.remoteVideo : el.localVideo;
    const link = liveLink(state.watching || state.me.nick);
    if (video && video.readyState >= 2 && video.videoWidth) {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      const files = [new File([blob], 'live.png', { type: 'image/png' })];
      if (navigator.canShare && navigator.canShare({ files })) {
        try {
          await navigator.share({ files, text: 'Mira mi directo', url: link });
          return;
        } catch (_) { /* el usuario canceló */ }
      }
    }
    prompt('Copiá este enlace:', link);
  };

  $('#fullscreenLocalBtn').addEventListener('click', () => {
    el.localVideo.requestFullscreen?.();
  });
  $('#fullscreenRemoteBtn').addEventListener('click', () => {
    el.remoteVideo.requestFullscreen?.();
  });

  (function setupEmoji() {
    if (!el.emojiBtn || !window.EmojiButton) {
      el.emojiBtn?.classList.add('d-none');
      return;
    }
    const insert = (emoji) => {
      el.message.value += emoji;
      el.message.focus();
    };
    try {
      const picker = new window.EmojiButton();
      picker.togglePicker(el.emojiBtn);
      picker.on('emoji', insert);
      el.emojiBtn.onclick = () => picker.togglePicker(el.emojiBtn);
    } catch (_) {
      try {
        const picker = new window.EmojiButton({
          root: el.emojiBtn,
          trigger: el.emojiBtn,
          onClick: insert
        });
        if (!picker) throw new Error('sin picker');
      } catch (__) {
        el.emojiBtn.classList.add('d-none');
      }
    }
  })();
})();