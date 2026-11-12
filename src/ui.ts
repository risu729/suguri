const styles = String.raw`
:root{font-family:system-ui,-apple-system,"Segoe UI","Noto Sans JP",sans-serif;color:#23362d;background:#f7f8f3;font-size:16px;line-height:1.65;color-scheme:light;--green:#246345;--line:#dfe5dc;--muted:#526359}
*{box-sizing:border-box}body{margin:0}button,input,select,textarea{font:inherit}button,a,input,select,textarea{touch-action:manipulation}button,a{ -webkit-tap-highlight-color:transparent}button{cursor:pointer}button:disabled{cursor:wait;opacity:.6}a{color:var(--green);text-underline-offset:3px}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #c08a27;outline-offset:3px}[hidden]{display:none!important}.skip{position:absolute;left:16px;top:-80px;background:white;padding:10px;z-index:10}.skip:focus{top:10px}
button,.button{border:1px solid var(--line);border-radius:10px;background:#fff;color:#254332;padding:9px 14px;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-weight:600;min-height:44px}button:hover,.button:hover{background:#edf3e9}.primary{background:var(--green);border-color:var(--green);color:white}.primary:hover{background:#1a4e35}.danger{color:#994132}.quiet{background:transparent}.layout{display:grid;grid-template-columns:232px minmax(0,1fr);min-height:100vh}.sidebar{padding:38px 24px;border-right:1px solid var(--line);background:#eff3e9}.brand{font-size:30px;font-weight:750;letter-spacing:-1.5px;display:flex;align-items:center;gap:9px}.brand-mark{color:var(--green);font-size:34px}.tagline{color:var(--muted);font-size:14px;margin:0 0 34px}.navigation{display:grid;gap:8px}.navigation button{justify-content:flex-start;background:transparent;border-color:transparent;padding:12px}.navigation button[aria-current="page"]{background:white;border-color:var(--line);box-shadow:0 2px 6px #263b2210}.side-note{margin-top:36px;font-size:14px;color:var(--muted)}.main{padding:30px 48px 60px;max-width:1400px;width:100%;margin:0 auto}.topbar{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-bottom:26px;border-bottom:1px solid var(--line);margin-bottom:30px}.eyebrow{color:var(--muted);font-size:14px;letter-spacing:.06em}.topbar p{margin:0}.top-actions,.row,.actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.section-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:22px}.section-heading h1{font-size:28px;letter-spacing:-.04em;margin:0 0 4px}.section-heading p{margin:0;color:var(--muted)}h2{font-size:20px;margin:0 0 14px}h3{font-size:18px;margin:0}.panel,.video-card,.category-card,.rule-card{border:1px solid var(--line);background:white;border-radius:16px;padding:22px}.panel{margin-bottom:22px}.muted,.help{color:var(--muted);font-size:14px}.help{margin:7px 0 0}.notice{padding:14px 18px;background:#eaf1e3;border:1px solid #d0dfc4;border-radius:10px;margin-bottom:20px}.notice.error{background:#fff0e9;border-color:#efc3ad;color:#833e2d}.notice:empty{display:none}.filters{display:grid;grid-template-columns:1fr 1fr 2fr;gap:12px;margin-bottom:20px}.field{display:flex;flex-direction:column;gap:6px;min-width:0}.field label,.label{font-weight:600;font-size:14px}.field input,.field select,.field textarea{width:100%;min-height:44px;border:1px solid #bbc8b9;border-radius:9px;background:#fff;padding:9px 11px;color:inherit}.field textarea{min-height:88px;resize:vertical}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.span-all{grid-column:1/-1}.inline-form{display:flex;gap:10px;align-items:flex-end}.inline-form .field{flex:1}.video-list,.rule-list{display:grid;gap:14px}.video-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px}.video-card h2{font-size:18px;margin:8px 0 4px;overflow-wrap:anywhere}.video-card h2 a{color:inherit;text-decoration:none}.video-card h2 a:hover{text-decoration:underline}.video-card .metadata{margin:0;color:var(--muted);font-size:14px;overflow-wrap:anywhere}.video-actions{display:flex;flex-direction:column;justify-content:center;gap:10px;max-width:330px}.video-actions .field select{max-width:190px}.video-actions button{font-size:14px}.badge{display:inline-block;background:#edf2e9;border-radius:30px;padding:3px 10px;font-size:14px;font-weight:600;color:#36503e}.badge.error{background:#fff0e9;color:#833e2d}.badge.manual{background:#f5eed9;color:#765d22}.badge.deferred{background:#e9eff7;color:#3f5a7a}.badges{display:flex;gap:6px;flex-wrap:wrap}.empty{padding:52px 24px;text-align:center;border:1px dashed #bac9b7;border-radius:16px}.empty h2{margin-bottom:8px}.empty p{color:var(--muted);max-width:500px;margin:0 auto}.category-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.category-card{border-top:4px solid #92aa75}.category-card h2{margin-bottom:6px}.category-card p{margin:8px 0 16px}.category-card .field{margin-top:16px}.category-card .actions{margin-top:12px}.category-icon{font-size:24px;margin-right:7px}.rule-card{display:flex;justify-content:space-between;gap:16px;align-items:center}.rule-card p{margin:4px 0;color:var(--muted);font-size:14px;overflow-wrap:anywhere}.rule-card .actions{flex-shrink:0}.checkbox{display:flex;gap:10px;align-items:center}.checkbox input{width:20px;height:20px;accent-color:var(--green)}.preview-list{margin:12px 0 0;padding-left:22px}.preview-list li{margin:8px 0;overflow-wrap:anywhere}.setting-row{display:flex;justify-content:space-between;align-items:center;gap:20px}.setting-row p{margin:6px 0}.setting-row h2{margin-bottom:0}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.stat-value{font-size:25px;font-weight:700}.stats p{margin:0}.progress{width:100%;height:12px;accent-color:var(--green);margin-top:14px}.welcome{max-width:650px;margin:60px auto;padding:38px}.welcome h1{font-size:32px;letter-spacing:-.04em}.welcome p{color:var(--muted)}.welcome .button{margin-top:14px}.divider{border:0;border-top:1px solid var(--line);margin:24px 0}.footer-note{font-size:14px;color:var(--muted);margin-top:28px}.load-more{display:block;margin:22px auto 0}.loading{color:var(--muted);padding:35px 0}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.search-input{flex:1;min-width:100px}.settings-actions{margin-top:18px}.video-thumbnail{width:160px;height:90px;object-fit:cover;border-radius:9px;float:left;margin:12px 18px 10px 0;background:#eff3e9}.video-description{clear:both;margin-top:12px;color:var(--muted);font-size:14px}.video-description summary{cursor:pointer;min-height:30px}.description-text{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto}.video-card:after{content:"";display:block;clear:both}
@media(min-width:1400px){.main{padding-top:40px}}@media(max-width:1000px){.main{padding:26px}.video-card{grid-template-columns:1fr}.video-actions{max-width:none;flex-direction:row;flex-wrap:wrap;justify-content:flex-start}.video-actions .row{flex-wrap:nowrap}}@media(max-width:720px){.layout{display:block}.sidebar{padding:16px 20px;border-right:0;border-bottom:1px solid var(--line)}.brand{font-size:25px}.brand-mark{font-size:28px}.tagline,.side-note{display:none}.navigation{display:flex;gap:3px;overflow:auto;margin-top:12px}.navigation button{white-space:nowrap;font-size:14px;padding:9px 12px}.main{padding:20px 16px 42px}.topbar{padding-bottom:20px;margin-bottom:24px;align-items:flex-start}.top-actions{justify-content:flex-end}.top-actions button{font-size:14px;padding:8px 10px}.section-heading h1{font-size:25px}.filters{grid-template-columns:1fr 1fr}.filters .field:last-child{grid-column:1/-1}.category-grid,.form-grid{grid-template-columns:1fr}.span-all{grid-column:auto}.panel,.video-card,.category-card,.rule-card{padding:18px}.inline-form{align-items:stretch;flex-direction:column}.inline-form button{align-self:flex-start}.stats{gap:12px}.stat-value{font-size:21px}.stats .muted{font-size:14px}.setting-row,.rule-card{align-items:flex-start;flex-direction:column}.welcome{margin:26px 0;padding:24px}.welcome h1{font-size:27px}.video-actions{gap:8px}.video-actions .field select{max-width:170px}.rule-card .actions{flex-shrink:1}}@media(prefers-reduced-motion:no-preference){button,.button{transition:background .15s ease}}`;

const client = String.raw`
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const statusNames = {pending:'情報を確認中',review:'要確認',queued:'反映待ち',added:'追加済み',excluded:'対象外',deferred:'配信終了待ち',error:'対応が必要',unavailable:'取得できません',removed:'削除済み'};
  let state = null;
  const selectedVideos = new Map();
  let editingId = '';
  let draftRuleId = crypto.randomUUID();
  let ruleTemplates = [];
  let channelCursor = null;
  let channelRequestNumber = 0;
  let channelQuery = '';
  let previewCursor = null;
  let previewSnapshot = '';
  let previewSampled = 0;
  let previewMatched = 0;
  let previewGeneration = 0;
  let editingSeriesId = '';
  let requestNumber = 0;
  let busy = 0;
  let activeSection = 'inbox';
  let googleConfigured = true;
  const el = (tag, className, text) => {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = String(text);
    return item;
  };
  const button = (text, handler, className = '') => {
    const item = el('button', className, text);
    item.type = 'button';
    item.addEventListener('click', handler);
    return item;
  };
  function announce(text, error = false) {
    $('message').textContent = text;
    $('message').className = error ? 'notice error' : 'notice';
    $('message').setAttribute('role', error ? 'alert' : 'status');
  }
  function errorText(error) {
    if (error.code === 'reconnect_required' || error.code === 'connection_required') return 'Googleとの接続を確認できません。「Googleに接続」から接続をやり直してください。';
    if (error.code === 'category_in_use') return 'この保存先は動画・ルール・シリーズで使われているため、削除できません。';
    if (error.code === 'series_playlist_immutable') return '登録済みシリーズのプレイリストは変更できません。登録を解除してから新しく登録してください。';
    if (['busy','pipeline_busy','token_refresh_busy'].includes(error.code)) return 'ほかの処理が進んでいます。少し待ってから、もう一度操作してください。';
    if (['playlist_insert_uncertain','playlist_creation_uncertain_attach_manually'].includes(error.code)) return '直前の操作結果を確認中です。重複を防ぐため、保存先を確認してから再試行してください。';
    if (error.code === 'playlist_migration_required') return '接続済みのプレイリストはここでは置き換えられません。別の保存先を作成してください。';
    if (error.code === 'playlist_must_be_owned_and_private') return '自分が所有する非公開プレイリストを指定してください。';
    if (error.status === 409) return 'ほかの操作で内容が更新されました。最新の状態を表示しました。もう一度操作してください。';
    if (error.status === 401) return '接続を確認するため、もう一度ログインしてください。';
    if (error.status === 429) return '本日の利用上限か一時的な制限に達しました。時間をおいて再試行してください。';
    const messages = {not_configured:'接続の準備が完了していません。設定を確認してください。',invalid_url:'YouTubeの動画またはShortsのURLを入力してください。',invalid_rule:'ルールの入力内容を確認してください。',invalid_playlist:'自分が所有する非公開プレイリストのIDを確認してください。',playlist_not_private:'非公開のプレイリストを指定してください。',reconnect_required:'Googleとの接続をやり直してください。',csrf:'ページを更新してから、もう一度操作してください。',quota_exceeded:'本日の利用上限に達しました。',uncertain:'直前の操作結果を確認中です。重複を防ぐため、しばらくお待ちください。'};
    return (Object.hasOwn(messages,error.code) ? messages[error.code] : null) || (error.status === 400 ? '入力内容を確認してください。保存先や数値の指定が正しくない可能性があります。' : '操作を完了できませんでした。接続を確認し、時間をおいて再試行してください。');
  }
  async function api(path, body, method = 'POST') {
    const response = await fetch(path, {
      method, credentials:'same-origin',
      headers: {'Content-Type':'application/json','X-CSRF-Token':state ? state.csrfToken : ''},
      body:JSON.stringify(body ?? {})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error('request_failed');
      error.status = response.status;
      error.code = typeof result.error === 'string' ? result.error : '';
      throw error;
    }
    return result;
  }
  async function mutate(path, body, message, method = 'POST') {
    if (busy) return false;
    busy++;
    $('app').setAttribute('aria-busy','true');
    $('app').querySelectorAll('button').forEach(item => {item.disabled = true;});
    try {
      await api(path,body,method);
      await loadState();
      announce(message);
      return true;
    } catch (error) {
      if (error.code === 'reconnect_required' || error.code === 'connection_required') activeSection = 'settings';
      if (error.status === 409 || error.status === 401) await loadState();
      announce(errorText(error),true);
      return false;
    } finally {
      busy--;
      $('app').removeAttribute('aria-busy');
      $('app').querySelectorAll('button').forEach(item => {item.disabled = false;});
    }
  }
  function showSection(section, focus = true) {
    activeSection = section;
    document.querySelectorAll('[data-section]').forEach(item => {item.hidden = item.dataset.section !== section;});
    document.querySelectorAll('[data-nav]').forEach(item => {
      if (item.dataset.nav === section) item.setAttribute('aria-current','page');
      else item.removeAttribute('aria-current');
    });
    if (focus) document.querySelector('[data-section="'+section+'"] h1').focus();
  }
  function categoryOptions(select, includeEmpty = false, emptyLabel = 'すべての保存先') {
    const selected = select.value;
    select.replaceChildren();
    if (includeEmpty) {
      const option = el('option','',emptyLabel); option.value = ''; select.append(option);
    }
    (state ? state.categories : []).forEach(category => {
      const option = el('option','',category.name); option.value = category.id; select.append(option);
    });
    if ([...select.options].some(option => option.value === selected)) select.value = selected;
  }
  function categoryName(id) {
    return state.categories.find(category => category.id === id)?.name || '保存先未設定';
  }
  function reasonText(video) {
    if (video.reason === 'removed_externally') return 'YouTube上で取り除かれた動画です。自動では再追加しません。';
    if (video.manualOverride) return '手動で指定した内容を優先しています。';
    if (video.reason === 'outside_backfill_window') return '過去の動画を確認する範囲より前の動画です。手動で保存先を指定できます。';
    if (video.reason === 'series_follow') return 'フォロー中のシリーズとして分類しました。';
    if (video.reason === 'series_hold') return '保留中のシリーズの動画です。自動では追加しません。';
    if (video.status === 'deferred') return '配信の終了後に、もう一度確認します。';
    if (video.reason === 'unmatched') return '一致するルールがありません。保存先を選んでください。';
    if (typeof video.reason === 'string' && video.reason.startsWith('rule:')) {
      const rule = state.rules.find(rule => rule.id === video.reason.slice(5));
      return rule ? 'ルール「'+rule.name+'」に一致しました。' : 'ルールに従って分類しました。';
    }
    if (video.status === 'queued') return 'プレイリストへの変更を順次反映します。';
    return '';
  }
  function durationText(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '長さ未確認';
    const total = Math.floor(seconds);
    return total >= 3600 ? Math.floor(total/3600)+'時間'+Math.floor(total%3600/60)+'分' : Math.floor(total/60)+'分'+total%60+'秒';
  }
  function dateText(value) {
    if (!value) return 'まだありません';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '未確認' : date.toLocaleString('ja-JP',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  function videoAction(video, action, categoryId) {
    const messages = {assign:'保存先を指定しました。プレイリストへの変更を順次反映します。',exclude:'対象外にしました。追加済みの動画は保存先から取り除きます。',reset:'手動指定を解除し、ルールで見直します。',retry:'再試行を受け付けました。'};
    return mutate('/api/videos/'+encodeURIComponent(video.id),{action,version:video.version,...(categoryId ? {categoryId} : {})},messages[action]);
  }
  function processingError(code) {
    if (code.includes('quota')) return '本日の利用上限に達したため、次の利用枠を待っています。';
    const messages = {video_unavailable:'動画が削除されたか、現在はアクセスできません。',category_playlist_unconfigured:'保存先のプレイリストを設定してください。',playlist_insert_uncertain:'追加結果を確認中です。重複を防ぐため、通常の再試行では追加をやり直しません。',reconnect_required:'Googleとの再接続が必要です。',youtube_http_404:'YouTubeから対象を取得できませんでした。時間を置いて再確認します。',pipeline_lease_lost:'ほかの処理へ引き継ぐため待機しています。'};
    return messages[code] || '処理を完了できませんでした。接続や保存先を確認して再試行してください。';
  }
  function renderSelection() {
    $('selection-count').textContent = selectedVideos.size+'件選択中（最大50件）';
    $('selection-actions').hidden = selectedVideos.size === 0;
  }
  async function batchAction(action) {
    if (!selectedVideos.size || busy) return;
    const categoryId = $('batch-category').value;
    if (action === 'assign' && !categoryId) {announce('保存先を選んでください。',true);return;}
    if (action === 'exclude' && !window.confirm(selectedVideos.size+'件を対象外にします。保存済みの動画は管理しているプレイリストから取り除きます。')) return;
    const ok = await mutate('/api/videos/batch',{action,items:[...selectedVideos.values()],...(action === 'assign' ? {categoryId} : {})},'選択した動画への指定を受け付けました。変更を順次反映します。');
    if (ok) {selectedVideos.clear();renderVideos();}
  }
  function renderVideos() {
    const list = $('video-list'); list.replaceChildren();
    renderSelection();
    $('inbox-count').textContent = state.counts.review ? state.counts.review+'件の動画を確認できます' : '気になる動画を、いつもの保存先へ。';
    if (!state.videos.length) {
      const empty = el('div','empty');
      empty.append(el('h2','', 'ここに動画が届きます'),el('p','', '表示条件に合う動画はありません。登録チャンネルを同期するか、動画のURLを追加してください。'));
      list.append(empty);
    }
    state.videos.forEach(video => {
      const card = el('article','video-card');
      const content = el('div','');
      const selection = el('label','checkbox');
      const checkbox = el('input',''); checkbox.type = 'checkbox'; checkbox.checked = selectedVideos.has(video.id);
      checkbox.setAttribute('aria-label','「'+(video.title || video.id)+'」を選択');
      checkbox.addEventListener('change',() => {
        if (checkbox.checked && selectedVideos.size >= 50) {checkbox.checked = false;announce('一度に選べる動画は50件までです。',true);return;}
        if (checkbox.checked) selectedVideos.set(video.id,{id:video.id,version:video.version}); else selectedVideos.delete(video.id);
        renderSelection();
      });
      selection.append(checkbox,el('span','','選択')); content.append(selection);
      const badges = el('div','badges');
      badges.append(el('span','badge'+(video.status === 'error' || video.status === 'unavailable' ? ' error' : video.status === 'deferred' ? ' deferred' : ''),statusNames[video.status] || '確認中'));
      if (video.categoryId) badges.append(el('span','badge',categoryName(video.categoryId)));
      if (video.manualOverride) badges.append(el('span','badge manual','手動指定'));
      if (video.needsClassification) badges.append(el('span','badge deferred','ルール再判定待ち'));
      content.append(badges);
      const heading = el('h2','');
      if (/^[A-Za-z0-9_-]{11}$/.test(video.id)) {
        const link = el('a','',video.title || '動画の情報を確認中');
        link.href = 'https://www.youtube.com/watch?v='+encodeURIComponent(video.id);
        link.target = '_blank'; link.rel = 'noopener noreferrer';
        heading.append(link);
      } else heading.textContent = video.title || '動画の情報を確認中';
      if (/^[A-Za-z0-9_-]{11}$/.test(video.id)) {
        const image = el('img','video-thumbnail');
        image.src = 'https://i.ytimg.com/vi/'+encodeURIComponent(video.id)+'/hqdefault.jpg';
        image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
        content.append(image);
      }
      content.append(heading,el('p','metadata',(video.channelTitle || 'チャンネル未確認')+' · '+durationText(video.durationSeconds)+' · '+dateText(video.publishedAt)));
      if (video.channelId) {
        const channel = el('a','metadata','チャンネルを開く');
        channel.href = 'https://www.youtube.com/channel/'+encodeURIComponent(video.channelId);
        channel.target = '_blank'; channel.rel = 'noopener noreferrer'; content.append(channel);
      }
      if (video.description) {
        const details = el('details','video-description');
        const description = el('p','description-text',video.description); description.tabIndex = 0;
        details.append(el('summary','','説明を読む'),description); content.append(details);
      }
      const reason = reasonText(video); if (reason) content.append(el('p','help',reason));
      if (video.lastError) {
        content.append(el('p','help',processingError(video.lastError)));
        const errorDetails = el('details',''); errorDetails.append(el('summary','','エラーの詳細'),el('code','',video.lastError)); content.append(errorDetails);
      }
      const controls = el('div','video-actions');
      const assign = el('div','row'); const field = el('div','field');
      const select = el('select',''); select.setAttribute('aria-label','「'+(video.title || '動画')+'」の保存先');
      categoryOptions(select); if (video.categoryId) select.value = video.categoryId;
      field.append(select);
      if (state.categories.length) assign.append(field,button(video.categoryId ? '移動・指定' : '分類する',() => videoAction(video,'assign',select.value),'primary'));
      else assign.append(el('p','help','「保存先」でカテゴリを作ると分類できます。'));
      const extra = el('div','actions');
      if (video.status !== 'excluded') extra.append(button('対象外',() => videoAction(video,'exclude'),'quiet danger'));
      if (video.manualOverride || video.status === 'excluded') extra.append(button('ルールに戻す',() => videoAction(video,'reset'),'quiet'));
      if (video.status === 'error' || video.status === 'unavailable') extra.append(button('再試行',() => videoAction(video,'retry'),'quiet'));
      if (typeof video.lastError === 'string' && video.lastError.includes('playlist_insert_uncertain')) {
        extra.append(button('追加結果を確認して再試行',() => {
          if (!window.confirm('YouTubeの保存先プレイリストを開き、この動画が追加されていないことを確認しましたか？ 再試行後に以前のリクエストが遅れて反映されると、動画が重複する可能性があります。確認済みで、その可能性を了承する場合だけ続けてください。')) return;
          void mutate('/api/videos/'+encodeURIComponent(video.id),{action:'retry_missing',version:video.version,confirmation:'checked_playlist_absent'},'保存先の再確認と再試行を受け付けました。');
        },'quiet'));
      }
      controls.append(assign,extra); card.append(content,controls); list.append(card);
    });
    $('load-more').hidden = !state.hasMore;
  }
  function renderCategories() {
    const target = $('category-list'); target.replaceChildren();
    if (!state.categories.length) target.append(el('p','muted','保存先はまだありません。用途に合わせた名前で作成してください。'));
    state.categories.forEach(category => {
      const card = el('article','category-card');
      card.append(el('h2','',category.name));
      const manage = el('div','actions');
      manage.append(button('名前を変更',() => {
        const name = window.prompt('保存先の新しい名前',category.name);
        if (name && name.trim()) void mutate('/api/categories/'+encodeURIComponent(category.id),{action:'rename',name:name.trim()},'保存先の名前を変更しました。');
      },'quiet'),button('削除',() => {
        if (window.confirm('この保存先を削除しますか？ 動画やルールで使用中の保存先は削除できません。YouTubeのプレイリストは削除しません。')) void mutate('/api/categories/'+encodeURIComponent(category.id),undefined,'保存先を削除しました。','DELETE');
      },'quiet danger')); card.append(manage);
      const status = category.playlistState === 'ready' ? '非公開プレイリストに接続済み' : category.playlistState === 'uncertain' ? '作成結果を確認しています' : '保存先を設定してください';
      card.append(el('p','muted',status));
      if (category.playlistId) {
        const link = el('a','button','YouTubeで開く');
        link.href = 'https://www.youtube.com/playlist?list='+encodeURIComponent(category.playlistId);
        link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link);
      }
      if (category.lastError) card.append(el('p','help','保存先を確認できません。接続とプレイリストの公開設定を確認してください。'));
      if (category.playlistState !== 'ready') {
        card.append(button(category.playlistState === 'uncertain' ? '作成結果を確認する' : '非公開プレイリストを作る',() => mutate('/api/categories/'+encodeURIComponent(category.id),{action:'create'},'保存先の設定を受け付けました。'),'primary'));
        const form = el('form',''); const field = el('div','field');
        const label = el('label','','既存の非公開プレイリストを使う');
        const input = el('input',''); input.id = 'playlist-'+category.id; label.htmlFor = input.id;
        input.placeholder = 'プレイリストのURLまたはID'; input.required = true; input.autocomplete = 'off';
        field.append(label,input);
        const actions = el('div','actions'); const submit = el('button','','この保存先を使う'); submit.type = 'submit'; actions.append(submit);
        form.append(field,actions,el('p','help','自分が所有する非公開プレイリストだけを指定できます。'));
        form.addEventListener('submit',event => {
          event.preventDefault(); let playlistId = input.value.trim();
          try {const url = new URL(playlistId); if (url.hostname === 'www.youtube.com' || url.hostname === 'youtube.com') playlistId = url.searchParams.get('list') || '';} catch {}
          if (!playlistId) {announce('プレイリストのURLまたはIDを入力してください。',true);return;}
          void mutate('/api/categories/'+encodeURIComponent(category.id),{action:'attach',playlistId},'保存先を接続しました。');
        });
        card.append(form);
      }
      target.append(card);
    });
  }
  function ruleSummary(rule) {
    const conditions = [];
    if (rule.channelId) conditions.push('指定チャンネル');
    if (rule.titleIncludes.length) conditions.push('タイトル: '+rule.titleIncludes.join(' / '));
    if (rule.titleExcludes.length) conditions.push('除外語: '+rule.titleExcludes.join(' / '));
    if (rule.descriptionIncludes.length) conditions.push('説明: '+rule.descriptionIncludes.join(' / '));
    if (rule.minDurationSeconds !== null || rule.maxDurationSeconds !== null) conditions.push((rule.minDurationSeconds === null ? '指定なし' : rule.minDurationSeconds+'秒')+' 〜 '+(rule.maxDurationSeconds === null ? '指定なし' : rule.maxDurationSeconds+'秒'));
    if (rule.kind !== 'any') conditions.push(rule.kind === 'archive' ? '配信アーカイブ' : '通常のアップロード');
    return conditions.length ? conditions.join(' · ') : 'すべての動画';
  }
  function renderRules() {
    const target = $('rule-list'); target.replaceChildren();
    if (!state.rules.length) target.append(el('p','muted','ルールはまだありません。ルールに一致しない動画は、要確認に残ります。'));
    state.rules.toSorted((a,b) => a.priority-b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).forEach(rule => {
      const card = el('article','rule-card'); const content = el('div','');
      content.append(el('h3','',rule.name),el('p','', '優先度 '+rule.priority+' · '+(rule.enabled ? '有効' : '無効')+' · '+(rule.action === 'categorize' ? categoryName(rule.categoryId)+'へ分類' : rule.action === 'exclude' ? '対象外にする' : '要確認に残す')),el('p','',ruleSummary(rule)));
      const actions = el('div','actions'); actions.append(button('編集',() => editRule(rule)),button('削除',async () => {
        if (!window.confirm('このルールを削除しますか？ 手動で指定した内容は保持されます。')) return;
        if (await mutate('/api/rules/'+encodeURIComponent(rule.id),undefined,'ルールを削除しました。','DELETE')) {if (editingId === rule.id) resetRule();}
      },'quiet danger'));
      card.append(content,actions); target.append(card);
    });
  }
  function editRule(rule) {
    $('rule-channel').required = false; $('rule-template-help').textContent = '';
    editingId = rule.id; $('rule-heading').textContent = 'ルールを編集';
    $('rule-name').value = rule.name; $('rule-priority').value = rule.priority;
    $('rule-enabled').checked = rule.enabled; $('rule-action').value = rule.action;
    $('rule-category').value = rule.categoryId || state.categories[0]?.id || ''; $('rule-channel').value = rule.channelId || '';
    $('rule-title-includes').value = rule.titleIncludes.join('\n'); $('rule-title-excludes').value = rule.titleExcludes.join('\n');
    $('rule-description').value = rule.descriptionIncludes.join('\n');
    $('rule-min').value = rule.minDurationSeconds === null ? '' : rule.minDurationSeconds;
    $('rule-max').value = rule.maxDurationSeconds === null ? '' : rule.maxDurationSeconds;
    $('rule-kind').value = rule.kind; $('rule-category').disabled = rule.action !== 'categorize';
    clearRulePreview(); $('rule-name').focus();
  }
  function clearRulePreview() {
    previewGeneration++;
    previewCursor = null; previewSnapshot = ''; previewSampled = 0; previewMatched = 0;
    $('preview-results').replaceChildren(); $('preview-more').hidden = true;
  }
  function resetRule() {
    draftRuleId = crypto.randomUUID(); $('rule-channel').required = false; $('rule-template-help').textContent = '';
    editingId = ''; $('rule-form').reset(); $('rule-heading').textContent = 'ルールを追加';
    $('rule-category').disabled = false; clearRulePreview();
  }
  async function loadRuleTemplates() {
    try {
      const response = await fetch('/api/rules/templates',{credentials:'same-origin',cache:'no-store'});
      if (!response.ok) throw new Error('templates_unavailable');
      ruleTemplates = (await response.json()).templates;
      ruleTemplates.forEach(template => {
        const option = el('option','',template.name); option.value = template.id; $('rule-template').append(option);
      });
      $('rule-template').disabled = false;
    } catch { $('rule-template-help').textContent = 'ひな形を読み込めませんでした。ページを更新するか、下の欄から条件を入力してください。'; }
  }
  function applyRuleTemplate() {
    const template = ruleTemplates.find(item => item.id === $('rule-template').value);
    if (!template) return;
    const categoryId = $('rule-category').value || null;
    const channelId = $('rule-channel').value.trim() || null;
    resetRule();
    editRule({...template.rule,id:'',categoryId,channelId});
    $('rule-heading').textContent = 'ルールを追加';
    $('rule-template').value = template.id;
    $('rule-channel').required = template.requiresChannel;
    $('rule-template-help').textContent = template.description+(template.requiresChannel ? ' 対象チャンネルを必ず選択してください。' : '')+' 条件と保存先を確認してから保存します。';
    void searchRuleChannels(false);
  }
  async function searchRuleChannels(append = false) {
    const query = $('rule-channel-search').value.trim();
    if (append && query !== channelQuery) append = false;
    const number = ++channelRequestNumber;
    const params = new URLSearchParams(); if (query) params.set('q',query);
    if (append && channelCursor !== null) params.set('cursor',String(channelCursor));
    $('rule-channel-search-button').disabled = true;
    try {
      const response = await fetch('/api/channels?'+params,{credentials:'same-origin',cache:'no-store'});
      if (!response.ok) throw new Error('channels_unavailable');
      const result = await response.json(); if (number !== channelRequestNumber) return;
      const select = $('rule-channel-options');
      if (!append) { select.replaceChildren(el('option','','チャンネルを選択')); select.firstElementChild.value = ''; }
      result.channels.forEach(channel => {
        const option = el('option','',channel.title || channel.id); option.value = channel.id; select.append(option);
      });
      channelQuery = query; channelCursor = result.nextCursor;
      $('rule-channel-more').hidden = channelCursor === null;
      $('rule-channel-search-status').textContent = select.options.length > 1 ? (select.options.length-1)+'件を表示しています。' : '一致する登録チャンネルはありません。';
    } catch { if (number === channelRequestNumber) $('rule-channel-search-status').textContent = 'チャンネルを読み込めませんでした。再検索してください。'; }
    finally { if (number === channelRequestNumber) $('rule-channel-search-button').disabled = false; }
  }
  function playlistValue(value) {
    const trimmed = value.trim();
    try {
      const url = new URL(trimmed);
      if (url.hostname === 'www.youtube.com' || url.hostname === 'youtube.com') return url.searchParams.get('list') || '';
    } catch {}
    return trimmed;
  }
  function renderSeries() {
    const target = $('series-list'); target.replaceChildren();
    if (!state.series.length) target.append(el('p','muted','シリーズはまだ登録されていません。プレイリスト単位で扱いを指定できます。'));
    state.series.forEach(series => {
      const card = el('article','rule-card'); const content = el('div','');
      content.append(el('h3','',series.name),el('p','',(series.mode === 'hold' ? '保留' : 'フォロー')+(series.categoryId ? ' · '+categoryName(series.categoryId) : '')));
      const link = el('a','','YouTubeでプレイリストを開く');
      link.href = 'https://www.youtube.com/playlist?list='+encodeURIComponent(series.playlistId);
      link.target = '_blank'; link.rel = 'noopener noreferrer'; content.append(link);
      const actions = el('div','actions');
      if (series.mode === 'follow' || series.categoryId) actions.append(button(series.mode === 'hold' ? '追いついたのでフォロー' : 'いったん保留',async () => {
        const mode = series.mode === 'hold' ? 'follow' : 'hold';
        if (mode === 'follow' && !window.confirm('フォローに切り替えますか？ 過去'+state.settings.backfillDays+'日以内の未処理動画も保存対象になります。')) return;
        await mutate('/api/series',{id:series.id,name:series.name,playlistId:series.playlistId,categoryId:series.categoryId,mode},mode === 'follow' ? 'シリーズのフォローを開始しました。' : 'シリーズを保留しました。');
      }));
      actions.append(button('編集',() => {
        editingSeriesId = series.id; $('series-name').value = series.name; $('series-playlist').value = series.playlistId; $('series-playlist').readOnly = true;
        $('series-mode').value = series.mode; $('series-category').value = series.categoryId || ''; $('series-name').focus();
      }),button('登録を解除',async () => {
        if (!window.confirm('このシリーズの登録を解除しますか？ YouTubeのプレイリストは削除しません。')) return;
        if (await mutate('/api/series/'+encodeURIComponent(series.id),undefined,'シリーズの登録を解除しました。','DELETE')) {
          if (editingSeriesId === series.id) resetSeries();
        }
      },'quiet danger'));
      card.append(content,actions); target.append(card);
    });
  }
  function resetSeries() {
    editingSeriesId = ''; $('series-form').reset(); $('series-category').value = ''; $('series-playlist').readOnly = false;
  }
  function readRule() {
    const split = (id) => $(id).value.split(/[,、\n]/).map(item => item.trim()).filter(Boolean);
    const optionalNumber = (id) => $(id).value === '' ? null : Number($(id).value);
    return {id:editingId || draftRuleId,name:$('rule-name').value.trim(),priority:Number($('rule-priority').value),enabled:$('rule-enabled').checked,action:$('rule-action').value,categoryId:$('rule-action').value === 'categorize' ? $('rule-category').value : null,channelId:$('rule-channel').value.trim() || null,titleIncludes:split('rule-title-includes'),titleExcludes:split('rule-title-excludes'),descriptionIncludes:split('rule-description'),minDurationSeconds:optionalNumber('rule-min'),maxDurationSeconds:optionalNumber('rule-max'),kind:$('rule-kind').value};
  }
  async function previewRule(append = false) {
    if (!$('rule-form').reportValidity()) return;
    if ($('rule-action').value === 'categorize' && !$('rule-category').value) {announce('先に「保存先」でカテゴリを作成してください。',true);return;}
    if (busy) return; busy++;
    const trigger = $('preview-rule'); trigger.disabled = true;
    try {
      const rule = readRule(), snapshot = JSON.stringify(rule);
      if (snapshot !== previewSnapshot) append = false;
      if (!append) clearRulePreview();
      const generation = previewGeneration;
      const result = await api('/api/rules/preview',{...rule,...(append ? {cursor:previewCursor} : {})});
      if (generation !== previewGeneration || JSON.stringify(readRule()) !== snapshot) return;
      const target = $('preview-results');
      previewSnapshot = snapshot; previewCursor = result.nextCursor;
      previewSampled += result.sampled; previewMatched += result.matches.length;
      if (!append) target.append(el('p','help'));
      target.firstElementChild.textContent = '確認対象 '+previewSampled+'件 · 条件に一致 '+previewMatched+'件。既存ルール・手動指定・シリーズを含む判定を表示します。保存するまで変更されません。';
      const list = el('ul','preview-list');
      result.matches.forEach(match => {
        const decision = match.effectiveDecision;
        const previous = decision.reason.startsWith('rule:') ? state.rules.find(item => 'rule:'+item.id === decision.reason && item.id !== rule.id) : null;
        const why = match.manualOverride ? '手動指定を保持' : decision.reason === 'series_hold' ? 'シリーズを保留中' : decision.reason === 'series_follow' ? 'シリーズの保存先' : previous ? '既存ルール: '+previous.name : decision.reason === 'awaiting_end' ? '公開・配信終了待ち' : '今回のルール';
        list.append(el('li','',match.title+' / '+match.channelTitle+' → '+(decision.categoryId ? categoryName(decision.categoryId) : statusNames[decision.status])+'（'+why+'）'));
      });
      target.append(list);
      $('preview-more').hidden = previewCursor === null;
    } catch (error) {announce(errorText(error),true);}
    finally {busy--; trigger.disabled = false;}
  }
  function renderState() {
    $('loading').hidden = true; $('welcome').hidden = true; $('app').hidden = false;
    $('connection-state').textContent = state.connected ? (state.reconnectRequired ? '再接続が必要です' : 'YouTubeに接続済み') : 'YouTube未接続';
    $('connection-detail').textContent = !googleConfigured ? 'Googleとの接続準備が完了していません。' : state.channelTitle ? state.channelTitle : '自分のYouTubeアカウントを接続します。';
    $('connection-link').textContent = state.connected ? '接続をやり直す' : 'Googleに接続';
    $('connection-link').hidden = !googleConfigured;
    $('disconnect').hidden = !state.connected;
    $('header-status').textContent = !state.connected ? '接続待ち' : state.reconnectRequired ? '再接続が必要' : state.settings.enabled ? '自動整理中' : '自動整理は停止中';
    $('pause-status').textContent = state.settings.enabled ? '自動整理は有効です' : '自動整理は停止しています';
    if (!$('settings-form').contains(document.activeElement)) {
      $('enabled').checked = state.settings.enabled;
      $('daily-budget').value = state.settings.dailyBudgetUnits; $('daily-limit').value = state.settings.dailyInsertLimit;
      $('backfill-days').querySelectorAll('[data-custom]').forEach(option => option.remove());
      if (![7,30].includes(state.settings.backfillDays)) {
        const option = el('option','','過去'+state.settings.backfillDays+'日間'); option.value = String(state.settings.backfillDays); option.dataset.custom = 'true'; $('backfill-days').append(option);
      }
      $('backfill-days').value = String(state.settings.backfillDays);
    }
    $('quota-units').textContent = state.quota.units.toLocaleString('ja-JP');
    $('quota-insertions').textContent = state.quota.insertions+' / '+state.settings.dailyInsertLimit;
    $('channel-total').textContent = state.channels.total;
    $('quota-progress').max = Math.max(1,state.settings.dailyBudgetUnits);
    $('quota-progress').value = Math.min(state.quota.units,Math.max(1,state.settings.dailyBudgetUnits));
    $('sync-status').textContent = '最終同期 '+dateText(state.lastSyncAt)+' · 最終整理 '+dateText(state.lastRunAt);
    $('websub-status').textContent = '新着通知の設定: '+state.channels.activeWebSub+' / '+state.channels.total+'チャンネル · 過去の動画の確認: '+state.channels.backfillComplete+' / '+state.channels.total+'チャンネル'+(state.channels.backfillFailed ? ' · 再確認待ち: '+state.channels.backfillFailed+'チャンネル（YouTubeから取得できなかったため、時間を置いて再試行します）' : '');
    $('notification-status').textContent = '通知で受け取った動画: '+state.notifications.videos+'件 · 最終受信 '+dateText(state.notifications.lastReceivedAt);
    const failures = $('collection-errors'); failures.replaceChildren();
    (state.collectionErrors || []).forEach(error => {
      const item = el('div','panel');
      item.append(el('h3','',error.title || error.channelId),el('p','help',processingError(error.code)),el('p','help','次の確認 '+dateText(error.nextAttemptAt)));
      item.append(button('このチャンネルを再確認',() => mutate('/api/channels/'+encodeURIComponent(error.channelId)+'/retry',{},'再確認を受け付けました。通常の利用上限内で順次処理します。')));
      failures.append(item);
    });
    $('connection-warning').hidden = !state.reconnectRequired;
    $('processing-warning').hidden = !state.lastError;
    categoryOptions($('category-filter'),true); categoryOptions($('rule-category')); categoryOptions($('series-category'),true,'保存先を指定しない'); categoryOptions($('batch-category'),true,'保存先を選択');
    renderVideos(); renderCategories(); renderRules(); renderSeries(); showSection(activeSection,false);
  }
  async function loadState(append = false) {
    const current = ++requestNumber;
    const params = new URLSearchParams();
    params.set('status',$('status-filter').value);
    if ($('category-filter').value) params.set('category',$('category-filter').value);
    if ($('search').value.trim()) params.set('q',$('search').value.trim());
    if (append && state && state.nextCursor !== null) params.set('cursor',String(state.nextCursor));
    try {
      const response = await fetch('/api/state?'+params,{credentials:'same-origin',cache:'no-store'});
      if (current !== requestNumber) return;
      if (response.status === 401) {
        state = null; $('loading').hidden = true; $('app').hidden = true; $('welcome').hidden = false;
        $('header-status').textContent = '接続待ち'; return;
      }
      if (!response.ok) throw new Error('load_failed');
      const next = await response.json();
      if (current !== requestNumber) return;
      if (append && state) {
        const merged = new Map(state.videos.map(video => [video.id,video]));
        next.videos.forEach(video => merged.set(video.id,video)); next.videos = [...merged.values()];
      }
      if (!append) selectedVideos.clear();
      state = next; renderState();
    } catch {
      if (current !== requestNumber) return;
      $('loading').hidden = true;
      announce('動画を読み込めませんでした。接続を確認して「更新」を押してください。',true);
    }
  }
  document.querySelectorAll('[data-nav]').forEach(item => item.addEventListener('click',() => {if (state) showSection(item.dataset.nav);}));
  $('refresh').addEventListener('click',() => {void loadState();});
  $('select-visible').addEventListener('click',() => {selectedVideos.clear();state.videos.slice(0,50).forEach(video => selectedVideos.set(video.id,{id:video.id,version:video.version}));renderVideos();});
  $('clear-selection').addEventListener('click',() => {selectedVideos.clear();renderVideos();});
  $('batch-assign').addEventListener('click',() => {void batchAction('assign');});
  $('batch-exclude').addEventListener('click',() => {void batchAction('exclude');});
  $('batch-reset').addEventListener('click',() => {void batchAction('reset');});
  $('batch-retry').addEventListener('click',() => {void batchAction('retry');});
  $('status-filter').addEventListener('change',() => {void loadState();});
  $('category-filter').addEventListener('change',() => {void loadState();});
  $('search-form').addEventListener('submit',event => {event.preventDefault();void loadState();});
  $('load-more').addEventListener('click',() => {void loadState(true);});
  $('process').addEventListener('click',() => {void mutate('/api/process',{},'動画の確認とプレイリストへの反映を受け付けました。');});
  $('sync').addEventListener('click',() => {void mutate('/api/sync',{},'チャンネルの同期を受け付けました。新着動画は順次届きます。');});
  $('disconnect').addEventListener('click',() => {
    if (window.confirm('このアプリに保存したGoogleとの接続情報を削除しますか？ 自動整理はできなくなります。ルールと分類は保持します。Google側のアクセス許可の取り消しは、Googleアカウントの設定で行ってください。')) void mutate('/api/disconnect',{},'このアプリとGoogleの接続を解除しました。');
  });
  $('manual-form').addEventListener('submit',async event => {
    event.preventDefault();
    if (await mutate('/api/videos',{url:$('video-url').value.trim()},'動画を受け付けました。内容を確認して分類します。')) $('video-url').value = '';
  });
  $('settings-form').addEventListener('submit',event => {
    event.preventDefault();
    void mutate('/api/settings',{enabled:$('enabled').checked,dailyBudgetUnits:Number($('daily-budget').value),dailyInsertLimit:Number($('daily-limit').value),backfillDays:Number($('backfill-days').value)},'整理の設定を保存しました。');
  });
  $('rule-action').addEventListener('change',() => {$('rule-category').disabled = $('rule-action').value !== 'categorize';});
  $('rule-template-apply').addEventListener('click',applyRuleTemplate);
  $('rule-channel-search-button').addEventListener('click',() => {void searchRuleChannels(false);});
  $('rule-channel-more').addEventListener('click',() => {void searchRuleChannels(true);});
  $('rule-channel-options').addEventListener('change',() => {
    if ($('rule-channel-options').value) { $('rule-channel').value = $('rule-channel-options').value; clearRulePreview(); }
  });
  $('rule-channel-clear').addEventListener('click',() => { $('rule-channel').value = ''; $('rule-channel-options').value = ''; clearRulePreview(); });
  $('rule-channel-search').addEventListener('keydown',event => { if (event.key === 'Enter') {event.preventDefault(); void searchRuleChannels(false);} });
  $('rule-form').addEventListener('input',clearRulePreview);
  $('rule-form').addEventListener('submit',async event => {
    event.preventDefault();
    if ($('rule-action').value === 'categorize' && !$('rule-category').value) {announce('先に「保存先」でカテゴリを作成してください。',true);return;}
    if (await mutate('/api/rules',readRule(),'ルールを保存し、最近の動画を見直します。手動指定した動画は保持します。')) resetRule();
  });
  $('reset-rule').addEventListener('click',resetRule);
  $('preview-rule').addEventListener('click',() => {void previewRule();});
  $('preview-more').addEventListener('click',() => {void previewRule(true);});
  $('category-form').addEventListener('submit',async event => {
    event.preventDefault();
    if (await mutate('/api/categories',{name:$('category-name').value.trim()},'保存先を作成しました。続けて非公開プレイリストを接続してください。')) $('category-name').value = '';
  });
  $('reevaluate').addEventListener('click',() => {void mutate('/api/reevaluate',{},'最近の動画をルールで見直します。手動指定した動画は保持します。');});
  $('series-form').addEventListener('submit',async event => {
    event.preventDefault();
    if ($('series-mode').value === 'follow' && !$('series-category').value) {announce('フォロー中の保存先を選択してください。',true);return;}
    const body = {name:$('series-name').value.trim(),playlistId:playlistValue($('series-playlist').value),categoryId:$('series-category').value || null,mode:$('series-mode').value,...(editingSeriesId ? {id:editingSeriesId} : {})};
    if (await mutate('/api/series',body,'シリーズの扱いを保存しました。')) resetSeries();
  });
  $('reset-series').addEventListener('click',resetSeries);
  categoryOptions($('category-filter'),true); categoryOptions($('rule-category'));
  fetch('/api/config',{credentials:'same-origin',cache:'no-store'}).then(response => response.ok ? response.json() : null).then(config => {
    if (config && !config.configured) {
      googleConfigured = false;
      $('connection-link').hidden = true;
      $('connection-detail').textContent = 'Googleとの接続準備が完了していません。';
    }
  }).catch(() => {});
  const pageUrl = new URL(window.location.href);
  const connectionError = pageUrl.searchParams.get('connection_error');
  if (connectionError) {
    activeSection = 'settings';
    const connectionMessages = {
      cancelled:'Googleとの接続をキャンセルしました。接続するときは「Googleに接続」を選んでください。',
      invalid_oauth_state:'接続の有効時間が切れたか、別の接続操作が開始されました。「Googleに接続」からやり直してください。',
      reconnect_required:'Googleが接続情報を受け付けませんでした。「Googleに接続」からやり直してください。',
      youtube_channel_required:'選択したアカウントのYouTubeチャンネルを確認できませんでした。普段使っているチャンネルを選択してください。',
      youtube_channel_unavailable:'Googleが選択したYouTubeチャンネルへのAPI接続を認めませんでした。チャンネルの所有者アカウントと接続設定を確認してください。',
      youtube_scope_required:'YouTubeへのアクセス許可が足りません。「Googleに接続」から必要な権限を確認してください。',
      google_client_invalid:'Google連携の認証情報を確認できません。管理者による設定確認が必要です。',
      youtube_api_disabled:'YouTube APIが利用できません。管理者によるGoogle設定の確認が必要です。',
      youtube_access_denied:'GoogleがYouTubeへのアクセスを拒否しました。選択したチャンネルと権限を確認してください。',
      channel_change_requires_migration:'別のチャンネルへの接続変更には、既存の保存先とデータの移行が必要です。'
    };
    announce(Object.hasOwn(connectionMessages,connectionError) ? connectionMessages[connectionError] : 'Googleとの接続を完了できませんでした。「Googleに接続」から接続をやり直してください。',connectionError !== 'cancelled');
    pageUrl.searchParams.delete('connection_error');
    window.history.replaceState(null,'',pageUrl.pathname+pageUrl.search+pageUrl.hash);
  }
  void loadState();
  void loadRuleTemplates();
})();`;

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderApp(nonce = ""): string {
  const safeNonce = escapeAttribute(nonce);
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Suguri — 動画をよりすぐる</title><style nonce="${safeNonce}">${styles}</style></head>
<body><a class="skip" href="#main">本文へ移動</a><div class="layout">
<aside class="sidebar"><div class="brand"><span class="brand-mark" aria-hidden="true">❧</span>Suguri</div><p class="tagline">動画を、よりすぐる。</p>
<nav class="navigation" aria-label="メインメニュー"><button type="button" data-nav="inbox" aria-current="page">受信箱</button><button type="button" data-nav="categories">保存先</button><button type="button" data-nav="rules">ルール</button><button type="button" data-nav="series">シリーズ</button><button type="button" data-nav="settings">接続と設定</button></nav>
<p class="side-note">Shortsも整理できます。<br>配信中の動画は終了を待って確認します。</p><p class="side-note"><a href="/info/about">Suguriについて</a> · <a href="/info/privacy">プライバシー</a></p></aside>
<main class="main" id="main"><header class="topbar"><div><p class="eyebrow">自分のための動画棚</p><p id="header-status">読み込み中</p></div><div class="top-actions"><button type="button" id="refresh">更新</button></div></header>
<div id="message" class="notice" role="status" aria-live="polite"></div><p id="loading" class="loading" role="status">動画棚を読み込んでいます…</p>
<section id="welcome" class="panel welcome" hidden><p class="eyebrow">Suguriへようこそ</p><h1>見たい動画を、<br>自分のペースで。</h1><p>登録チャンネルの新着から、気になる動画をよりすぐって非公開プレイリストへ。ルールに迷う動画は受信箱に残し、あとから見直せます。</p><p id="welcome-note">ログインすると、自分の動画棚を開けます。YouTubeとの接続は、ログイン後に設定します。</p><a id="welcome-login" class="button primary" href="/cdn-cgi/access/login">ログインして始める</a></section>
<div id="app" hidden>
<p id="connection-warning" class="notice error" hidden>Googleとの接続を確認できません。「接続と設定」から再接続してください。</p><p id="processing-warning" class="notice error" hidden>処理が止まっています。接続、保存先、本日の利用量を確認し、再試行してください。</p>
<section data-section="inbox"><div class="section-heading"><div><h1 tabindex="-1">受信箱</h1><p id="inbox-count">気になる動画を、いつもの保存先へ。</p></div><button id="process" type="button">今すぐ整理</button></div>
<form id="manual-form" class="panel inline-form"><div class="field"><label for="video-url">動画を追加</label><input id="video-url" type="url" required autocomplete="off" placeholder="YouTubeの動画・ShortsのURL"><p class="help">登録外のチャンネルの動画も追加できます。</p></div><button class="primary" type="submit">受信箱に追加</button></form>
<form id="search-form" class="filters" role="search"><div class="field"><label for="status-filter">状態</label><select id="status-filter"><option value="review">要確認</option><option value="all">すべて</option><option value="pending">情報を確認中</option><option value="queued">反映待ち</option><option value="added">追加済み</option><option value="deferred">配信終了待ち</option><option value="excluded">対象外</option><option value="error">対応が必要</option><option value="unavailable">取得できません</option><option value="removed">削除済み</option></select></div><div class="field"><label for="category-filter">保存先</label><select id="category-filter"></select></div><div class="field"><label for="search">動画を探す</label><div class="row"><input id="search" class="search-input" type="search" placeholder="タイトル・チャンネル"><button type="submit">検索</button></div></div></form>
<div class="panel"><div class="actions"><button id="select-visible" type="button">表示中の先頭50件を選択</button><button id="clear-selection" type="button">選択を解除</button><span id="selection-count" aria-live="polite"></span></div><div id="selection-actions" class="actions" hidden><div class="field"><label for="batch-category">選択した動画の保存先</label><select id="batch-category"></select></div><button id="batch-assign" type="button">まとめて分類</button><button id="batch-exclude" type="button">まとめて対象外</button><button id="batch-reset" type="button">まとめてルールに戻す</button><button id="batch-retry" type="button">まとめて再試行</button></div></div><div id="video-list" class="video-list"></div><button id="load-more" class="load-more" type="button" hidden>続きを表示</button><p class="footer-note">手動の分類・対象外の指定を優先します。「ルールに戻す」で解除できます。保存先を移動すると、以前の保存先からは取り除きます。</p></section>
<section data-section="categories" hidden><div class="section-heading"><div><h1 tabindex="-1">保存先</h1><p>用途ごとの非公開プレイリストを、自分のYouTubeに。</p></div></div>
<form id="category-form" class="panel inline-form"><div class="field"><label for="category-name">保存先の名前</label><input id="category-name" required maxlength="120" placeholder="用途がわかる名前"></div><button class="primary" type="submit">保存先を作る</button></form>
<div id="category-list" class="category-grid"></div><p class="footer-note">公開・限定公開や、ほかの人のプレイリストには書き込みません。</p></section>
<section data-section="rules" hidden><div class="section-heading"><div><h1 tabindex="-1">ルール</h1><p>小さい優先度から順に確認し、最初に一致したルールを使います。</p></div><button id="reevaluate" type="button">最近の動画を見直す</button></div><div id="rule-list" class="rule-list"></div><hr class="divider">
<form id="rule-form" class="panel"><h2 id="rule-heading">ルールを追加</h2><div class="form-grid">
<div class="field span-all"><label for="rule-template">ひな形から条件を作る</label><div class="row"><select id="rule-template" disabled><option value="">ひな形を選択</option></select><button id="rule-template-apply" type="button">入力欄へ反映</button></div><p id="rule-template-help" class="help">ひな形を選び、対象チャンネル・保存先を指定して、結果を確認してから保存できます。</p></div>
<div class="field"><label for="rule-name">ルール名</label><input id="rule-name" required maxlength="120" placeholder="内容がわかる名前"></div><div class="field"><label for="rule-priority">優先度（小さい順）</label><input id="rule-priority" type="number" value="100" required step="1"></div>
<div class="field"><label for="rule-action">一致した動画の扱い</label><select id="rule-action"><option value="categorize">保存先へ分類</option><option value="review">要確認に残す</option><option value="exclude">対象外にする</option></select></div><div class="field"><label for="rule-category">保存先</label><select id="rule-category"></select></div>
<div class="field span-all"><label for="rule-channel-search">登録チャンネルから選ぶ</label><div class="row"><input id="rule-channel-search" placeholder="チャンネル名を検索" maxlength="200" autocomplete="off"><button id="rule-channel-search-button" type="button">検索</button></div><label for="rule-channel-options">検索結果</label><select id="rule-channel-options"><option value="">チャンネルを検索してください</option></select><div class="actions"><button id="rule-channel-more" type="button" hidden>検索結果の続き</button><button id="rule-channel-clear" type="button">チャンネル指定を解除</button></div><p id="rule-channel-search-status" class="help" aria-live="polite"></p><label for="rule-channel">対象チャンネルID</label><input id="rule-channel" placeholder="検索結果を選択すると入力されます" pattern="UC[A-Za-z0-9_-]{22}" maxlength="24" autocomplete="off"><p class="help">空欄なら全チャンネルが対象です。歌枠・雑談などのひな形では、対象チャンネルを指定してください。</p></div>
<div class="field"><label for="rule-title-includes">タイトルに含む言葉</label><textarea id="rule-title-includes" placeholder="キーワードを改行で区切って入力"></textarea></div><div class="field"><label for="rule-title-excludes">タイトルに含まない言葉</label><textarea id="rule-title-excludes" placeholder="除外したいキーワード"></textarea></div>
<div class="field span-all"><label for="rule-description">説明文に含む言葉</label><textarea id="rule-description" placeholder="任意のキーワード"></textarea><p class="help">改行かカンマで区切ります。同じ欄の言葉はいずれか1つが一致すれば対象です。入力した条件はすべて満たす必要があります。</p></div>
<div class="field"><label for="rule-min">最短の長さ（秒・任意）</label><input id="rule-min" type="number" min="0" step="1"></div><div class="field"><label for="rule-max">最長の長さ（秒・任意）</label><input id="rule-max" type="number" min="0" step="1"></div>
<div class="field"><label for="rule-kind">動画の種類</label><select id="rule-kind"><option value="any">すべて</option><option value="upload">通常のアップロード</option><option value="archive">終了した配信アーカイブ</option></select><p class="help">通常動画と配信は種類で分けます。Shortsは長さだけで除外しません。</p></div><label class="checkbox"><input id="rule-enabled" type="checkbox" checked>このルールを有効にする</label>
<div class="actions span-all"><button type="submit" class="primary">ルールを保存</button><button id="preview-rule" type="button">一致する動画を確認</button><button id="reset-rule" type="button" class="quiet">新しいルールに戻る</button></div></div><div id="preview-results" aria-live="polite"></div><button id="preview-more" type="button" hidden>残りの動画も確認</button>
<p class="help">条件が空欄のルールはすべての動画に一致します。一致するルールがない動画は要確認に残ります。保存・削除後は最近の動画を見直しますが、手動で指定した動画は変えません。</p></form></section>
<section data-section="series" hidden><div class="section-heading"><div><h1 tabindex="-1">シリーズ</h1><p>プレイリスト単位で、保留・フォローを指定できます。</p></div></div><div id="series-list" class="rule-list"></div><hr class="divider">
<form id="series-form" class="panel"><h2>シリーズを登録・編集</h2><div class="form-grid"><div class="field"><label for="series-name">シリーズ名</label><input id="series-name" required maxlength="120"></div><div class="field"><label for="series-playlist">YouTubeプレイリストのURL・ID</label><input id="series-playlist" required autocomplete="off"></div>
<div class="field"><label for="series-mode">扱い</label><select id="series-mode"><option value="hold">保留</option><option value="follow">フォロー</option></select></div><div class="field"><label for="series-category">フォロー中の保存先</label><select id="series-category"></select></div><p class="help span-all">保留中のシリーズは自動追加せず、受信箱に残します。フォロー中のシリーズは指定先へ分類します。追いついたらフォローへ切り替えてください。視聴の進み具合は自動判定しません。</p>
<div class="actions span-all"><button type="submit" class="primary">シリーズを保存</button><button id="reset-series" type="button">新規入力に戻る</button></div></div></form></section>
<section data-section="settings" hidden><div class="section-heading"><div><h1 tabindex="-1">接続と設定</h1><p>接続、整理のペース、本日の利用量を確認します。</p></div></div><div class="panel setting-row"><div><h2 id="connection-state">YouTube未接続</h2><p id="connection-detail" class="muted"></p></div><div class="actions"><a id="connection-link" class="button" href="/auth/start">Googleに接続</a><button id="disconnect" type="button" class="quiet">Googleとの接続を解除</button></div></div>
<form id="settings-form" class="panel"><h2 id="pause-status">自動整理は停止しています</h2><label class="checkbox"><input id="enabled" type="checkbox">自動整理を有効にする</label><p class="help">初めは停止しています。ルールと保存先を設定してから有効にしてください。停止中も、手動での分類や対象外の指定は反映します。</p><hr class="divider"><div class="form-grid">
<div class="field"><label for="daily-limit">1日に追加する動画の上限</label><input id="daily-limit" type="number" min="1" max="150" step="1" required></div><div class="field"><label for="daily-budget">1日のAPI利用上限（ユニット）</label><input id="daily-budget" type="number" min="100" max="9500" step="1" required><p class="help">YouTube APIの利用枠です。動画の追加・情報取得の両方で使います。</p></div>
<div class="field"><label for="backfill-days">過去の動画を確認する範囲</label><select id="backfill-days"><option value="7">過去7日間</option><option value="30">過去30日間</option></select><p class="help">登録チャンネルの同期や、ルール変更時の見直しに使います。保存済みの手動指定は保持します。</p></div></div><div class="actions settings-actions"><button class="primary" type="submit">設定を保存</button></div></form>
<div class="panel"><h2>本日の利用量</h2><div class="stats"><div><p class="muted">APIユニット</p><p id="quota-units" class="stat-value">0</p></div><div><p class="muted">動画の追加</p><p id="quota-insertions" class="stat-value">0</p></div><div><p class="muted">登録チャンネル</p><p id="channel-total" class="stat-value">0</p></div></div><progress id="quota-progress" class="progress" aria-label="1日のAPI利用上限に対する使用量" max="1" value="0"></progress><p class="help">YouTubeの利用量は米国太平洋時間の日付で集計します。</p></div>
<div id="collection-errors" aria-live="polite"></div><div class="panel setting-row"><div><h2>登録チャンネル</h2><p id="sync-status" class="muted"></p><p id="websub-status" class="muted"></p><p id="notification-status" class="muted"></p><p class="help">新着動画を順次受け取り、通知が届かなかった動画も定期的に確認します。通知の件数は受信記録を開始してからの集計です。</p></div><button id="sync" type="button">登録チャンネルを同期</button></div></section>
</div></main></div><script nonce="${safeNonce}">${client}</script></body></html>`;
}
