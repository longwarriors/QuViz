/*
 * QuViz 教材交互图。
 *
 * Markdown 里的 <figure class="quviz-figure" data-lab="mode=..." markdown> 只携带深链接与图注。
 * 本脚本把它升级成占位卡：“加载交互图”在原位插入实验室 embed 模式的 iframe，
 * “在实验室中打开”在新标签页打开同一深链接。实验室根地址来自主题覆盖注入的
 * <meta name="quviz-lab">（mkdocs.yml 的 extra.quviz.lab_url），相对教材站点根解析。
 */
;(function () {
  'use strict'

  var READY = 'data-quviz-ready'
  var ACTIVE = 'data-quviz-active'
  // allow-popups*：embed 模式里的“在实验室中打开”是 target=_blank 链接，没有它会被沙箱吞掉。
  var SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox'

  function siteRootFrom(configText, pageHref) {
    try {
      var base = JSON.parse(configText).base
      if (typeof base === 'string') return new URL(base, pageHref).href
    } catch (error) {
      // 没有 Material 的 __config（测试或非 Material 页面）时退回页面所在目录。
    }
    return new URL('./', pageHref).href
  }

  function normalizeDeepLink(value) {
    var link = String(value == null ? '' : value).trim().replace(/^#/, '')
    if (/[\s#<>"']/.test(link)) return null
    if (/(^|&)embed=/.test(link)) return null
    return link
  }

  function labRoot(labSetting, siteRoot) {
    var setting = String(labSetting == null ? '' : labSetting).trim()
    if (setting === '') return null
    var lab
    try {
      lab = new URL(setting, siteRoot)
    } catch (error) {
      return null
    }
    if (lab.protocol !== 'http:' && lab.protocol !== 'https:') return null
    lab.hash = ''
    return lab.href
  }

  function labUrls(labSetting, siteRoot, deepLink) {
    var root = labRoot(labSetting, siteRoot)
    var link = normalizeDeepLink(deepLink)
    if (root === null || link === null || link === '') return null
    return { embed: root + '#embed=1&' + link, open: root + '#' + link }
  }

  function textOf(node) {
    return node ? node.textContent || '' : ''
  }

  // Material 的即时导航只替换文章容器，不会重新执行 extra_javascript；__config.base 是相对
  // 首次整页加载的那个页面写的，所以站点根只在脚本首次执行时解析一次。
  var SITE_ROOT = siteRootFrom(textOf(document.getElementById('__config')), window.location.href)

  function labSetting() {
    var meta = document.querySelector('meta[name="quviz-lab"]')
    return meta ? meta.getAttribute('content') : null
  }

  function element(tag, className, text) {
    var node = document.createElement(tag)
    if (className) node.className = className
    if (text) node.textContent = text
    return node
  }

  function unload(figure) {
    var stage = figure.querySelector('.quviz-figure__stage')
    if (!stage) return
    var frame = stage.querySelector('.quviz-figure__frame')
    var bar = figure.querySelector('.quviz-figure__bar')
    if (frame) stage.removeChild(frame)
    if (bar) figure.removeChild(bar)
    var placeholder = stage.querySelector('.quviz-figure__placeholder')
    if (placeholder) placeholder.hidden = false
    figure.removeAttribute(ACTIVE)
  }

  // “关闭交互图”放在舞台下方的一条栏里，而不是叠在 iframe 上：嵌入的实验室把自己的
  // “在实验室中打开”放在右上角，叠在舞台上的按钮会盖住它、把点击变成关闭。
  function load(figure, urls, caption) {
    var active = document.querySelectorAll('figure.quviz-figure[' + ACTIVE + ']')
    for (var i = 0; i < active.length; i += 1) {
      if (active[i] !== figure) unload(active[i])
    }
    var stage = figure.querySelector('.quviz-figure__stage')
    if (!stage || figure.hasAttribute(ACTIVE)) return
    var frame = element('iframe', 'quviz-figure__frame')
    frame.setAttribute('src', urls.embed)
    frame.setAttribute('title', 'QuViz 交互图：' + caption)
    frame.setAttribute('loading', 'lazy')
    frame.setAttribute('sandbox', SANDBOX)
    frame.setAttribute('allow', 'fullscreen')
    frame.setAttribute('allowfullscreen', '')
    frame.setAttribute('referrerpolicy', 'no-referrer')
    var bar = element('div', 'quviz-figure__bar')
    var close = element('button', 'quviz-figure__close', '关闭交互图')
    close.setAttribute('type', 'button')
    close.addEventListener('click', function () {
      unload(figure)
      // 关闭后焦点回到刚才加载它的按钮，而不是丢给 <body>。
      var again = figure.querySelector('.quviz-figure__load')
      if (again) again.focus()
    })
    bar.appendChild(close)
    stage.querySelector('.quviz-figure__placeholder').hidden = true
    stage.appendChild(frame)
    figure.insertBefore(bar, stage.nextSibling)
    figure.setAttribute(ACTIVE, '')
    // 加载按钮随占位卡一起隐藏，焦点移到关闭按钮；不滚动页面。
    close.focus({ preventScroll: true })
  }

  function enhanceFigure(figure, setting) {
    if (figure.hasAttribute(READY)) return
    figure.setAttribute(READY, '')
    var caption = textOf(figure).replace(/\s+/g, ' ').trim().slice(0, 80)
    var urls = labUrls(setting, SITE_ROOT, figure.getAttribute('data-lab'))
    var stage = element('div', 'quviz-figure__stage')
    var placeholder = element('div', 'quviz-figure__placeholder')
    var actions = element('div', 'quviz-figure__actions')
    var button = element('button', 'quviz-figure__load md-button md-button--primary', '加载交互图')
    var link = element('a', 'quviz-figure__open md-button', '在实验室中打开')
    var note = element('p', 'quviz-figure__note')
    button.setAttribute('type', 'button')
    if (urls) {
      link.setAttribute('href', urls.open)
      link.setAttribute('target', '_blank')
      link.setAttribute('rel', 'noopener')
      button.addEventListener('click', function () {
        load(figure, urls, caption)
      })
      note.textContent = '点击后才加载实验室（需要 WebGL）；同一页面同时只运行一个交互图。'
    } else {
      button.disabled = true
      link.hidden = true
      figure.setAttribute('data-quviz-state', 'error')
      note.textContent = '无法确定实验室地址或深链接无效（extra.quviz.lab_url / data-lab），交互图不可用。'
    }
    placeholder.appendChild(element('span', 'quviz-figure__badge', '交互图 · WebGL'))
    actions.appendChild(button)
    actions.appendChild(link)
    placeholder.appendChild(actions)
    placeholder.appendChild(note)
    stage.appendChild(placeholder)
    figure.insertBefore(stage, figure.firstChild)
  }

  function enhanceLabLink(anchor, setting) {
    if (anchor.hasAttribute(READY)) return
    anchor.setAttribute(READY, '')
    var root = labRoot(setting, SITE_ROOT)
    var link = normalizeDeepLink(anchor.getAttribute('data-quviz-lab'))
    if (root === null || link === null) return
    anchor.setAttribute('href', link === '' ? root : root + '#' + link)
    anchor.hidden = false
  }

  function enhance() {
    var setting = labSetting()
    var figures = document.querySelectorAll('figure.quviz-figure')
    for (var i = 0; i < figures.length; i += 1) enhanceFigure(figures[i], setting)
    var anchors = document.querySelectorAll('a[data-quviz-lab]')
    for (var j = 0; j < anchors.length; j += 1) enhanceLabLink(anchors[j], setting)
  }

  window.QuvizFigure = { siteRootFrom: siteRootFrom, labRoot: labRoot, labUrls: labUrls, enhance: enhance }

  // document$ 在首次加载和每次 Material 即时导航换页后各发出一次。
  if (typeof document$ !== 'undefined') {
    document$.subscribe(enhance)
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhance)
  } else {
    enhance()
  }
})()
