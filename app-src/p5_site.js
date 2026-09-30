/* ================= website: accounts, plans, paywall, meter (website build only) ================= */
if (SITE) (() => {
  const S = SITE;
  const inr = p => '₹' + Math.round(p / 100).toLocaleString('en-IN');
  let supa = null, authWaiters = [], refreshT = null, rzpLoaded = null;
  const P = () => S.cfg?.prices || { pass: { amount: 399900, designs: 4, changes: 30, days: 90 }, topup: { amount: 49900, changes: 15 }, pro: { amount: 699900, homes: 6, changes: 200 }, max: { amount: 1499900, homes: 20, changes: 600 } };
  const home = () => (project && S.me?.homes?.[project.id]) || null;
  const sub = () => S.me?.sub || null;
  const subOn = () => !!sub()?.active;
  const homesLeft = () => Math.max(0, (sub()?.homes_limit || 0) - (sub()?.homes_used || 0));
  const changesLeftPro = () => Math.max(0, (sub()?.changes_limit || 0) - (sub()?.changes_used || 0));

  /* ---------- auth ---------- */
  function setToken(t) {
    S.token = t || null;
    if (S.token) { const w = authWaiters; authWaiters = []; w.forEach(f => f()); S.refresh().then(askPersona); }
    else { S.me = null; renderCredits(); }
  }
  S.onSignedOut = () => setToken(null);
  S.ensureAuth = () => S.token ? Promise.resolve() : new Promise(res => { authWaiters.push(res); openSignIn(); });

  function openSignIn() {
    if (document.getElementById('siEmail')) return;
    const test = S.cfg?.authMode === 'test';
    const m = modal(`<div class="eyebrow">[ Sign in ]</div><h2>Save your home to your account</h2>
      <p class="lead">Your bare 3D shell is free. An account keeps your homes and plans safe, and lets us read your floor plan.</p>
      ${test ? '' : '<button class="lg" id="siGoogle" style="width:100%;justify-content:center">Continue with Google</button><div class="or" style="text-align:center;color:var(--faint);font-size:12px;margin:14px 0">or</div>'}
      <label for="siEmail" class="eyebrow" style="display:block;margin-bottom:6px">Email</label>
      <div style="display:flex;gap:8px"><input type="text" id="siEmail" inputmode="email" autocomplete="email" placeholder="you@example.com" style="flex:1;padding:11px 12px;font-size:14px" data-autofocus>
      <button class="primary" id="siGo">${test ? 'Continue' : 'Email me a link'}</button></div>
      <p id="siMsg" class="lead" style="margin:12px 0 0;min-height:1.4em" aria-live="polite"></p>`);
    const msg = t => { m.el.querySelector('#siMsg').textContent = t; };
    m.el.querySelector('#siGoogle')?.addEventListener('click', async () => {
      const { error } = await supa.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
      if (error) msg(error.message);
    });
    const go = async () => {
      const email = m.el.querySelector('#siEmail').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) { msg('Enter a valid email address.'); return; }
      if (test) {
        let h = 0; for (const c of email) h = (h * 31 + c.charCodeAt(0)) >>> 0;
        const id = `00000000-0000-4000-8000-${h.toString(16).padStart(12, '0').slice(-12)}`;
        const t = `test:${id}:${email}`; try { localStorage.setItem('mirage-test-token', t); } catch { }
        m.close(); setToken(t); return;
      }
      m.el.querySelector('#siGo').disabled = true;
      const { error } = await supa.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
      m.el.querySelector('#siGo').disabled = false;
      msg(error ? error.message : `Check ${email} for a sign-in link. You can close this.`);
    };
    m.el.querySelector('#siGo').onclick = go;
    m.el.querySelector('#siEmail').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  }

  function askPersona() {
    if (!S.me || S.me.persona || document.getElementById('rcmp')) return;
    const m = modal(`<div class="eyebrow">[ One quick question ]</div><h2>Whose home is this?</h2>
      <p class="lead">So we can suggest the right plan. You can use Mirage either way.</p>
      <div class="packs" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <button class="pack" data-persona="own" style="text-align:left"><h3>My own home</h3><div class="n">Designing a flat or house I'm buying, building or moving into</div></button>
        <button class="pack" data-persona="pro" style="text-align:left"><h3>Homes for others</h3><div class="n">I'm a designer, architect, builder or broker</div></button>
      </div>`);
    m.el.querySelectorAll('[data-persona]').forEach(b => b.onclick = async () => { m.close(); try { await S.api('/api/me', { persona: b.dataset.persona }); S.me.persona = b.dataset.persona; } catch (e) { flash(e.message, true); } });
  }

  S.signOut = async () => { try { await supa?.auth.signOut(); } catch { } try { localStorage.removeItem('mirage-test-token'); } catch { } setToken(null); flash('Signed out.'); };

  /* ---------- state ---------- */
  S.refresh = async () => {
    if (!S.token) return null;
    try { S.me = await S.api('/api/me'); } catch (e) { if (e.status !== 401) console.warn(e); return null; }
    renderCredits(); if (project && $('genLabel')) renderGenState();
    if (project && S.token && project.id !== 'sample-home' && !S.me.homes[project.id] && project.plan?.image) S.api('/api/homes', { id: project.id, name: project.name }).catch(() => { });
    return S.me;
  };
  S.refreshSoon = () => { clearTimeout(refreshT); refreshT = setTimeout(S.refresh, 700); };

  S.renderMeter = () => {
    const b = $('btnWallet'); if (!b) return;
    let tag = 'Sign in', detail = '';
    if (S.token && S.me) {
      const h = home(), s = sub();
      if (subOn()) { tag = s.plan === 'max' ? 'PRO MAX' : 'PRO'; detail = `${homesLeft()} homes · ${changesLeftPro()} changes`; }
      else if (h?.access === 'pass') { tag = 'PASS'; detail = h.editable ? `${h.changes_left} changes · ${Math.max(0, Math.ceil((new Date(h.expires_at) - Date.now()) / 864e5))} days` : 'view only'; }
      else { tag = 'FREE'; detail = 'bare shell'; }
    }
    b.innerHTML = `<span class="gem"></span><b id="creditCount">${tag}</b>${detail ? `<span>${esc(detail)}</span>` : ''}`;
    b.setAttribute('aria-label', S.token ? `Your plan: ${tag} ${detail}` : 'Sign in');
    if ($('pgo') && !$('pinput').disabled) $('pgo').textContent = 'Apply';
  };

  S.decorateGen = (lbl, cost, note) => {
    const h = home(); cost.textContent = '';
    if (!project.plan?.image) { note.textContent = 'Reading your plan and walking the bare 3D shell is free.'; return; }
    if (!layout.walls.length) { note.textContent = 'Free. We find every room first, so you can give any room its own look before designing.'; return; }
    const redo = project.status === 'generated';
    lbl.textContent = redo ? 'Redesign my home' : 'Design my home';
    if (subOn() && (h?.access === 'pro' || !h || h.access === 'none')) {
      cost.textContent = sub().plan === 'max' ? 'Pro Max' : 'Pro';
      note.textContent = h?.access === 'pro' ? 'Restyles are free on your plan.' : `Uses 1 of your ${homesLeft()} homes left this month.`;
    } else if (h?.access === 'pass') {
      cost.textContent = 'Home Pass';
      note.textContent = h.editable ? `${h.designs_left} design${h.designs_left === 1 ? '' : 's'} left on this Home Pass. It's only counted when your home is ready.` : 'This Home Pass has ended. You can still walk and share this home.';
    } else {
      const L0 = S.cfg?.launch; cost.textContent = 'from ' + inr(L0?.active ? L0.amount : P().pass.amount);
      note.innerHTML = h?.teaser_used || project.teaserRoom ? 'Like the preview? Pick a plan to design every room.' : `Not sure yet? <button type="button" class="linkish" id="btnTeaser">Preview one room free</button>`;
      $('btnTeaser')?.addEventListener('click', () => teaserRoom());
    }
  };

  const PAY_CODES = ['payment_required', 'no_designs_left', 'no_changes_left', 'homes_limit', 'teaser_used', 'pass_expired', 'sub_inactive'];
  S.onError = e => { if (PAY_CODES.includes(e?.code)) setTimeout(() => S.paywall(e.code), 50); };

  S.canDesign = async p => {
    await S.ensureAuth(); await S.refresh();
    const h = home();
    if (h?.access === 'pass' && h.editable && h.designs_left > 0) return true;
    if (h?.access === 'pro' && subOn()) return true;
    if ((!h || h.access === 'none') && subOn() && homesLeft() > 0) return true;
    S.paywall(h?.access === 'pass' ? (h.editable ? 'no_designs_left' : 'pass_expired') : subOn() ? 'homes_limit' : h?.access === 'pro' ? 'sub_inactive' : 'payment_required');
    return false;
  };
  S.canEdit = async p => {
    await S.ensureAuth(); if (!S.me) await S.refresh();
    const h = home();
    if (h?.access === 'pass') { if (!h.editable) { S.paywall('pass_expired'); return false; } if (h.changes_left > 0) return true; S.paywall('no_changes_left'); return false; }
    if (h?.access === 'pro') { if (!subOn()) { S.paywall('sub_inactive'); return false; } if (changesLeftPro() > 0) return true; S.paywall('no_changes_left'); return false; }
    S.paywall('payment_required'); return false;
  };
  S.costLabel = () => { const h = home(); return h?.access === 'pass' ? '1 Home Pass design' : h?.access === 'pro' ? 'Free restyle' : subOn() ? '1 Pro home' : ''; };
  S.balanceText = () => { const h = home(); return h?.access === 'pass' ? `${Math.max(0, h.designs_left - 1)} left after this` : h?.access === 'pro' ? '' : subOn() ? `${Math.max(0, homesLeft() - 1)} homes left this month after this` : ''; };
  S.startGen = async p => { const r = await S.api('/api/generate', { action: 'start', homeId: p.id }); S.refreshSoon(); return r.genId; };
  S.finishGen = async genId => { try { const r = await S.api('/api/generate', { action: 'finish', genId }); if (r.status === 'refunded') flash('Nothing was placed, so this design was not counted.', true); } catch { } S.refresh(); };

  /* ---------- guided moments ---------- */
  // Wait for sign-in / the persona question to be answered before showing the next step.
  const whenFree = fn => { let n = 0; const t = setInterval(() => { if (!document.querySelector('#siEmail, [data-persona]') || ++n > 300) { clearInterval(t); fn(); } }, 400); };
  S.afterPlanRead = () => whenFree(afterPlanRead);
  const afterPlanRead = () => {
    const n = inspRooms().length, h = home();
    const rooms = inspRooms().filter(r => r.type !== 'other');
    const room = rooms.find(r => /living/i.test(r.type + ' ' + r.name)) || [...rooms].sort((a, b) => polyArea(b.polygon) - polyArea(a.polygon))[0];
    const canTease = room && !h?.teaser_used && !project.teaserRoom && (!h || h.access === 'none') && !subOn();
    const style = presetById(project.presetId)?.name || 'your chosen';
    const m = modal(`<div class="eyebrow">[ Plan read · ${n} rooms found ]</div><h2>Your bare 3D shell is ready</h2>
      <p class="lead">Walk through it and check the walls. If something looks off, fix it in <b>Fix the layout</b>.</p>
      ${canTease ? `<p class="lead">Want to see it come alive? We'll design your <b>${esc(room.name)}</b> in the ${esc(style)} style, free.</p>` : ''}
      <div class="mact"><button id="arPhotos">Add room photos</button><button data-close>Walk around first</button>${canTease ? `<button class="primary" id="arTease">Preview ${esc(room.name)} free</button>` : `<button class="primary" id="arDesign">Design my home</button>`}</div>`);
    m.el.querySelector('#arPhotos').onclick = () => { m.close(); askRoomInspo(); };
    m.el.querySelector('#arTease')?.addEventListener('click', () => { m.close(); teaserRoom(); });
    m.el.querySelector('#arDesign')?.addEventListener('click', () => { m.close(); requestGenerate(); });
  };
  S.afterTeaser = room => whenFree(() => afterTeaser(room));
  const afterTeaser = room => {
    S.refresh();
    const m = modal(`<div class="eyebrow">[ Free preview ]</div><h2>That's your ${esc(room.name)}.</h2>
      <p class="lead">Walk around it, then design every other room the same way. Close this to keep looking.</p>
      <div class="mact"><button data-close>Keep looking</button><button class="primary" id="atGo">Design the whole home</button></div>`);
    m.el.querySelector('#atGo').onclick = () => { m.close(); S.paywall('payment_required'); };
  };

  /* ---------- paywall and checkout ---------- */
  const card = (o) => `<div class="pack${o.best ? ' best' : ''}">${o.launch ? `<span class="tag launch">${o.launch}</span>` : o.tag ? `<span class="tag">${o.tag}</span>` : ''}<h3>${o.name}</h3>
    <div class="p">${o.price}<small>${o.per || ''}</small></div><ul class="feat">${o.feats.map(f => `<li>${f}</li>`).join('')}</ul>
    ${o.launchNote ? `<div class="n launchnote">${o.launchNote}</div>` : ''}<button class="${o.best ? 'primary' : ''}" data-buy="${o.id}"${o.disabled ? ' disabled' : ''}>${o.cta}</button>${o.note ? `<div class="n" style="margin-top:2px">${o.note}</div>` : ''}</div>`;

  S.paywall = async (reason = 'payment_required') => {
    S.lastPaywall = { reason, t: Date.now() };
    if (!S.token) { await S.ensureAuth(); }
    if (!S.me) await S.refresh();
    try { const c = await (await fetch('/api/config', { cache: 'no-store' })).json(); if (c?.launch) S.cfg.launch = c.launch; } catch { }
    const pr = P(), h = home(), s = sub(), persona = S.me?.persona, L = S.cfg?.launch;
    const passPrice = L?.active ? L.amount : pr.pass.amount;
    const nextTier = L?.active && L.tiers ? L.tiers.find(t => t.from >= (L.sold + L.spotsLeft)) : null;
    const titles = {
      payment_required: ['Design your whole home', 'Pick how you want to use Mirage. Your bare shell stays free either way.'],
      teaser_used: ['Design your whole home', 'You have seen your free room. Pick a plan to design the rest.'],
      no_designs_left: ['You have used your redesigns', 'This Home Pass included 1 design and 3 restyles. Go Pro for unlimited restyles.'],
      no_changes_left: ['You have used your changes', h?.access === 'pass' ? 'Add 15 more changes to this home, or go Pro.' : 'You have used this month\'s changes. Move up to Pro Max, or wait for your next cycle.'],
      homes_limit: ['You have designed this month\'s homes', 'Move up to Pro Max for 20 homes a month, or wait for your next cycle.'],
      pass_expired: ['This Home Pass has ended', 'You can still walk and share this home. Go Pro to keep editing it and design more homes.'],
      sub_inactive: ['Your subscription has ended', 'Your homes are view-only. Resubscribe to keep editing and designing.'],
    }[reason] || ['Choose a plan', ''];
    const planReady = !!(project && layout?.walls?.length && project.id !== 'sample-home');
    const passCard = { id: 'pass', name: 'Home Pass', price: (L?.active ? `<s class="was">${inr(L.regular)}</s>` : '') + inr(passPrice), per: ' one time', launch: L?.active ? `LAUNCH PRICE · ${L.spotsLeft} LEFT` : '', launchNote: L?.active ? (nextTier ? `${L.label} at ${inr(L.amount)}, then ${inr(nextTier.amount)} for the ${nextTier.label.toLowerCase()}.` : `${L.label} at ${inr(L.amount)}, then ${inr(L.regular)}.`) : '', feats: ['1 home, your floor plan', `1 design + ${pr.pass.designs - 1} restyles`, `${pr.pass.changes} changes by asking`, `${pr.pass.days} days of editing`, ...(pr.rendersOn ? [`${pr.renders.pass} photo-real renders`] : []), 'Walk and share forever'], cta: 'Get Home Pass', disabled: !planReady || h?.access === 'pass', note: !planReady ? 'Read your floor plan first.' : '' };
    const proCard = { id: 'pro', name: 'Mirage Pro', price: inr(pr.pro.amount), per: ' / month', feats: [`${pr.pro.homes} new homes a month`, 'Unlimited restyles', `${pr.pro.changes} changes a month`, ...(pr.rendersOn ? [`${pr.renders.pro} photo-real renders a month`] : []), 'Your logo on share links', 'Cancel anytime'], cta: S.me?.upgradeEligible && pr.upgradeOffer ? 'Go Pro · your pass counts' : 'Go Pro' };
    const maxCard = { id: 'max', name: 'Pro Max', price: inr(pr.max.amount), per: ' / month', feats: [`${pr.max.homes} new homes a month`, 'Unlimited restyles', `${pr.max.changes} changes a month`, ...(pr.rendersOn ? [`${pr.renders.max} photo-real renders a month`] : []), 'Everything in Pro'], cta: subOn() ? 'Switch to Pro Max' : 'Go Pro Max' };
    const topCard = { id: 'topup', name: '+15 changes', price: inr(pr.topup.amount), per: ' one time', feats: ['For this home', 'Use them anytime in your editing window'], cta: 'Add changes' };
    let cards;
    if (subOn()) cards = s.plan === 'max' ? [] : [{ ...maxCard, best: true, tag: 'UPGRADE' }];
    else if (reason === 'no_changes_left' && h?.access === 'pass') cards = [{ ...topCard, best: true }, proCard];
    else if (reason === 'no_designs_left' || reason === 'pass_expired' || reason === 'sub_inactive') cards = [{ ...proCard, best: true }, maxCard];
    else if (persona === 'pro') cards = [{ ...proCard, best: true, tag: 'FOR DESIGNERS' }, passCard, maxCard];
    else cards = [{ ...passCard, best: true, tag: 'FOR YOUR HOME' }, proCard, maxCard];
    const m = modal(`<div class="eyebrow">[ Plans ]</div><h2>${titles[0]}</h2><p class="lead">${titles[1]}</p>
      ${cards.length ? `<div class="packs">${cards.map(card).join('')}</div>` : '<p class="lead">You are on our biggest plan. Your homes and changes refresh at the start of each billing cycle.</p>'}
      ${!subOn() && cards.some(c => c.id === 'pro') ? `<p class="lead" style="font-size:12.5px;margin:0 0 14px">Designing more than one home? Pro is cheaper from your second.${S.me?.upgradeEligible && pr.upgradeOffer ? ' Bought a Home Pass this week? It comes off your first Pro month.' : ''}</p>` : ''}
      <div class="mact"><button data-close>Not now</button></div>`, { wide: true });
    m.el.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => { m.close(); buy(b.dataset.buy); });
  };

  const loadRzp = () => rzpLoaded ||= (window.Razorpay ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = res; s.onerror = () => { rzpLoaded = null; rej(new Error('Could not load the payment window. Check your connection.')); }; document.head.appendChild(s); }));

  async function buy(what) {
    try {
      await S.ensureAuth();
      let start;
      if (what === 'pass') { await S.api('/api/homes', { id: project.id, name: project.name }); start = await S.api('/api/billing', { action: 'pass', homeId: project.id }); }
      else if (what === 'topup') start = await S.api('/api/billing', { action: 'topup', homeId: project.id });
      else if (subOn()) { await S.api('/api/billing', { action: 'change', plan: what }); await S.refresh(); flash(`You're on ${what === 'max' ? 'Pro Max' : 'Pro'} now.`); return; }
      else start = await S.api('/api/billing', { action: 'subscribe', plan: what });
      await loadRzp();
      const names = { pass: 'Home Pass', topup: '+15 changes', pro: 'Mirage Pro', max: 'Mirage Pro Max' };
      const rz = new window.Razorpay({
        key: start.keyId, name: 'Mirage', description: names[what],
        ...(start.orderId ? { order_id: start.orderId, amount: start.amount, currency: start.currency } : { subscription_id: start.subscriptionId }),
        prefill: { email: start.email || '' }, theme: { color: '#5BF0D1' },
        handler: async resp => {
          try {
            await S.api('/api/billing', { action: 'verify', orderId: resp.razorpay_order_id, subscriptionId: resp.razorpay_subscription_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature });
            await S.refresh();
            flash(what === 'topup' ? '15 changes added.' : `Welcome to ${names[what]}. You're all set.`);
            if (what !== 'topup' && layout.walls.length && project.status !== 'generated') setTimeout(() => requestGenerate(), 400);
          } catch (e) { flash('Payment received, but we could not confirm it yet. It will appear in a minute. ' + e.message, true); setTimeout(S.refresh, 8000); }
        },
        modal: { ondismiss: () => flash('Payment cancelled. Nothing was charged.') },
      });
      rz.on?.('payment.failed', r => flash('Payment failed: ' + (r?.error?.description || 'try another method.'), true));
      rz.open();
    } catch (e) { flash(e.message || 'Could not start the payment.', true); }
  }
  S.buy = buy;

  /* ---------- account ---------- */
  S.openAccount = async () => {
    if (!S.token) { await S.ensureAuth(); return; }
    await S.refresh();
    const s = sub(), h = home(), me = S.me || {};
    const rows = [];
    if (subOn()) rows.push(['Plan', `${s.plan === 'max' ? 'Pro Max' : 'Pro'}${s.cancel_at_period_end ? ' · ends ' : ' · renews '}${s.current_end ? new Date(s.current_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}`], ['Homes this month', `${s.homes_used} of ${s.homes_limit}`], ['Changes this month', `${s.changes_used} of ${s.changes_limit}`]);
    else rows.push(['Subscription', 'None · bare shells are always free']);
    if (h?.access === 'pass') rows.push(['This home', `Home Pass · ${h.designs_left} designs, ${h.changes_left} changes left · edits until ${new Date(h.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`]);
    const m = modal(`<div class="eyebrow">[ Your account ]</div><h2>${esc(me.user?.email || 'Signed in')}</h2>
      <dl class="sumlist">${rows.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>
      <div class="mact"><button id="acOut">Sign out</button>${subOn() && !s.cancel_at_period_end ? '<button id="acCancel">Cancel subscription</button>' : ''}${h?.access === 'pass' && h.editable ? '<button id="acTop">Add 15 changes</button>' : ''}<button class="primary" id="acPlans">${subOn() ? 'Change plan' : 'See plans'}</button></div>`, { wide: true });
    m.el.querySelector('#acOut').onclick = () => { m.close(); S.signOut(); };
    m.el.querySelector('#acPlans').onclick = () => { m.close(); S.paywall('payment_required'); };
    m.el.querySelector('#acTop')?.addEventListener('click', () => { m.close(); buy('topup'); });
    m.el.querySelector('#acCancel')?.addEventListener('click', async () => {
      const c = modal(`<div class="eyebrow">[ Cancel ]</div><h2>Cancel your subscription?</h2><p class="lead">You keep everything until the end of this billing period. After that your homes stay viewable and shareable, but editing and new designs stop.</p><div class="mact"><button data-close>Keep my plan</button><button class="primary" id="ccGo">Cancel at period end</button></div>`);
      c.el.querySelector('#ccGo').onclick = async () => { c.close(); try { await S.api('/api/billing', { action: 'cancel' }); await S.refresh(); flash('Cancelled. Your plan stays active until the end of this period.'); } catch (e) { flash(e.message, true); } };
    });
  };

  /* ---------- photo-real render: the current view, redrawn as a real photograph ---------- */
  const RT = { day: 'day', golden: 'golden', night: 'night', dusk: 'dusk' };
  function grabView(maxW = 1344) {
    const src = renderer.domElement, k = Math.min(1, maxW / src.width), c = document.createElement('canvas');
    c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
    if (!photo) { if (composer) composer.render(); else renderer.render(scene, camera); }
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return { image: c.toDataURL('image/jpeg', .9), w: c.width, h: c.height };
  }
  async function renderReal() {
    if (!project || !layout.walls.length || activeView !== '3d') return flash('Open a home in 3D first, then frame the view you want.', true);
    await S.ensureAuth();
    const v = grabView(), r = mode === 'walk' ? roomAt(player.x, player.z) : null, st = project.roomStyles?.[r?.name] || project.style;
    const m = modal(`<div class="eyebrow">[ Photo-real ]</div><h2>${esc(r ? r.name : project.name || 'Your home')}</h2>
      <div class="rcmp" id="rcmp" style="aspect-ratio:${v.w}/${v.h}"><img src="${v.image}" alt="3D view"><div class="rwork"><span class="dots"></span><b>Rendering a real photo of this view…</b><small>About 10 to 30 seconds</small></div></div>
      <div class="mact"><button data-close>Close</button><button id="rAgain" disabled>Try another take</button><button class="primary" id="rSave" disabled>Download</button></div>`, { wide: true });
    const box = m.el.querySelector('#rcmp');
    const run = async seed => {
      box.classList.remove('done'); box.querySelector('.after')?.remove(); box.querySelector('.rhandle')?.remove(); box.querySelector('.rwork').hidden = false;
      m.el.querySelector('#rAgain').disabled = m.el.querySelector('#rSave').disabled = true;
      try {
        const out = await S.api('/api/render', { homeId: project.id, image: v.image, w: v.w, h: v.h, room: r?.name || 'whole home', roomType: r?.type || '', style: [st?.summary, ...(st?.features || []).slice(0, 6)].filter(Boolean).join('; '), time: RT[layout.settings.timeOfDay] || 'golden', ...(seed != null ? { seed } : {}) });
        if (!document.body.contains(box)) return;
        box.querySelector('.rwork').hidden = true; box.classList.add('done');
        box.insertAdjacentHTML('beforeend', `<div class="after"><img src="${out.image}" alt="Photo-real render"></div><div class="rhandle" style="left:50%"><i></i><span>3D</span><span>Real</span></div>`);
        const after = box.querySelector('.after'), hd = box.querySelector('.rhandle');
        const set = x => { const b = box.getBoundingClientRect(), p = Math.max(0, Math.min(1, (x - b.left) / b.width)); after.style.clipPath = `inset(0 0 0 ${p * 100}%)`; hd.style.left = p * 100 + '%'; };
        after.style.clipPath = 'inset(0 0 0 50%)';
        let drag = false; box.onpointerdown = e => { drag = true; box.setPointerCapture(e.pointerId); set(e.clientX); }; box.onpointermove = e => drag && set(e.clientX); box.onpointerup = () => drag = false;
        // sweep once so the change is obvious
        let t0 = null; const sweep = ts => { t0 ??= ts; const k = Math.min(1, (ts - t0) / 1400), p = .5 + .45 * Math.sin(k * Math.PI * 2) * (1 - k); after.style.clipPath = `inset(0 0 0 ${p * 100}%)`; hd.style.left = p * 100 + '%'; if (k < 1 && !drag) requestAnimationFrame(sweep); }; requestAnimationFrame(sweep);
        m.el.querySelector('#rSave').disabled = false; m.el.querySelector('#rAgain').disabled = false;
        m.el.querySelector('#rSave').onclick = () => { const a = document.createElement('a'); a.href = out.image; a.download = slug((project.name || 'mirage') + ' ' + (r?.name || 'view')) + '-photo.jpg'; a.click(); };
        S.refresh();
      } catch (e) {
        if (!document.body.contains(box)) return;
        box.querySelector('.rwork').innerHTML = `<b>${esc(e.message)}</b>`;
        if (['render_limit', 'no_renders_left'].includes(e.code)) { m.close(); S.paywall('payment_required'); flash(e.message, true); }
        else m.el.querySelector('#rAgain').disabled = false;
      }
    };
    m.el.querySelector('#rAgain').onclick = () => run(Math.floor(Math.random() * 1e6));
    run();
  }
  if ($('btnReal')) $('btnReal').onclick = renderReal;
  S.renderReal = renderReal;

  /* ---------- boot ---------- */
  (async () => {
    try { S.cfg = await (await fetch('/api/config')).json(); } catch { S.cfg = null; }
    if (S.cfg?.authMode === 'test') { try { const t = localStorage.getItem('mirage-test-token'); if (t) setToken(t); } catch { } }
    else if (S.cfg?.supabaseUrl) {
      try {
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        supa = createClient(S.cfg.supabaseUrl, S.cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
        const { data } = await supa.auth.getSession(); if (data?.session) setToken(data.session.access_token);
        supa.auth.onAuthStateChange((ev, session) => { const t = session?.access_token || null; if (t !== S.token) { if (t && document.getElementById('siEmail')) $('modalRoot').innerHTML = ''; setToken(t); } });
      } catch (e) { console.error('auth init', e); }
    }
    renderCredits();
    // the one-tap AI render is retired: the 3D itself is the product's look
    // Deep links from the landing page: /app#start opens a new home, /app#sample opens the sample home.
    const hash = location.hash.slice(1);
    if (hash === 'start' || hash === 'sample') { history.replaceState(null, '', location.pathname); setTimeout(() => $(hash === 'start' ? 'btnNewProj' : 'btnSampleHome')?.click(), 300); }
  })();
})();
