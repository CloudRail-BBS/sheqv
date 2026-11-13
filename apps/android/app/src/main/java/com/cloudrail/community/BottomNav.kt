package com.cloudrail.community

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.util.AttributeSet
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.animation.PathInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.annotation.DrawableRes
import androidx.core.content.ContextCompat

/**
 * 原生底部导航 —— Material 3 的 Navigation Bar。
 *
 * 为什么不用网页那条：`.tabbar` 随内容滚动重绘，在 WebView 里会跟页面一起抖；
 * 原生重画同样的条目与顺序，既保住识别度，又能吃到系统按压反馈、无障碍语义，
 * 以及「再点一次回到顶部」这类安卓习惯。
 *
 * 几何按 M3 规范（不是悬浮玻璃了）：
 * - 整条贴底，surface-container 底 + 顶部 1px outline-variant 分隔线；
 * - 每项图标 22dp、文字 10.5sp，选中项后面是 56×28 的 secondary-container 指示器；
 * - 选中图标用 on-secondary-container，文字用 on-surface（明确但不过分抢眼）。
 */
class BottomNav @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : FrameLayout(context, attrs) {

    data class Item(
        val key: String,
        val label: String,
        val path: String,
        @DrawableRes val icon: Int,
    )

    private class Holder(
        val item: Item,
        val root: LinearLayout,
        val pill: FrameLayout,
        val icon: ImageView,
        val label: TextView,
    )

    /** 移动端主路径：逛内容占多数，公会 / 约战这类低频入口留在首页与侧栏 */
    private val items = listOf(
        Item("home", "首页", "/", R.drawable.ic_nav_home),
        Item("resources", "资源库", "/resources", R.drawable.ic_nav_resources),
        Item("servers", "联机", "/servers", R.drawable.ic_nav_servers),
        Item("wiki", "百科", "/wiki", R.drawable.ic_nav_wiki),
        Item("me", "我的", "/me", R.drawable.ic_nav_me),
    )

    var onSelect: ((Item) -> Unit)? = null
    var onReselect: ((Item) -> Unit)? = null

    private val holders = ArrayList<Holder>(5)
    private var activeKey = items.first().key

    private val rowStrip = LinearLayout(context)
    private val topLine = View(context)
    private val glider = View(context)
    private var gliderBg: GradientDrawable
    private val surface: GradientDrawable

    private val density = resources.displayMetrics.density

    private var navBg = ContextCompat.getColor(context, R.color.m3_nav_light)
    private var lineColor = ContextCompat.getColor(context, R.color.m3_outline_light)
    private var indicator = ContextCompat.getColor(context, R.color.m3_indicator_light)
    private var onIndicator = ContextCompat.getColor(context, R.color.m3_on_indicator_light)
    private var onSurface = ContextCompat.getColor(context, R.color.m3_on_surface_light)
    private var onVariant = ContextCompat.getColor(context, R.color.m3_on_variant_light)
    private var ripple = ContextCompat.getColor(context, R.color.m3_indicator_light)

    private var gliderReady = false

    init {
        setWillNotDraw(false)
        // M3 的 navigation bar 是「贴在内容下面的一层表面」，不悬浮、不投影
        surface = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(navBg)
        }
        background = surface
        elevation = 0f

        topLine.setBackgroundColor(lineColor)
        addView(topLine, LayoutParams(LayoutParams.MATCH_PARENT, dp(1)).apply { gravity = Gravity.TOP })

        gliderBg = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(14).toFloat()
            setColor(indicator)
        }
        glider.background = gliderBg
        glider.alpha = 0f

        rowStrip.orientation = LinearLayout.HORIZONTAL
        rowStrip.gravity = Gravity.CENTER_VERTICAL
        rowStrip.setPadding(dp(4), dp(6), dp(4), dp(6))

        buildItems()
        addView(glider, LayoutParams(dp(56), dp(28)).apply { gravity = Gravity.TOP or Gravity.START })
        addView(rowStrip, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        paintAll(animate = false)

        // 首次布局完才知道每格坐标，位置在 post 里落一次
        post { moveGlider(animate = false) }
        addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> moveGlider(animate = false) }
    }

    // ── 构建 ──────────────────────────────────────────────────────

    private fun buildItems() {
        items.forEach { item ->
            val row = LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                layoutParams = LinearLayout.LayoutParams(0, LayoutParams.MATCH_PARENT, 1f)
                isClickable = true
                isFocusable = true
                contentDescription = item.label
                background = RippleDrawable(
                    ColorStateList.valueOf(ripple),
                    null,
                    GradientDrawable().apply {
                        shape = GradientDrawable.RECTANGLE
                        cornerRadius = dp(16).toFloat()
                        setColor(Color.WHITE)
                    },
                )
            }

            val pill = FrameLayout(context).apply {
                layoutParams = LinearLayout.LayoutParams(dp(56), dp(28))
            }
            val icon = ImageView(context).apply {
                setImageResource(item.icon)
                layoutParams = LayoutParams(dp(22), dp(22), Gravity.CENTER)
                setColorFilter(onVariant)
            }
            pill.addView(icon)

            val label = TextView(context).apply {
                text = item.label
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f)
                gravity = Gravity.CENTER
                setTextColor(onVariant)
                maxLines = 1
                includeFontPadding = false
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply { topMargin = dp(3) }
            }

            row.addView(pill)
            row.addView(label)

            val holder = Holder(item, row, pill, icon, label)
            holders.add(holder)
            row.accessibilityDelegate = object : View.AccessibilityDelegate() {
                override fun onInitializeAccessibilityNodeInfo(
                    host: View,
                    info: android.view.accessibility.AccessibilityNodeInfo,
                ) {
                    super.onInitializeAccessibilityNodeInfo(host, info)
                    info.isSelected = item.key == activeKey
                }
            }
            row.setOnClickListener { select(item) }
            rowStrip.addView(row)
        }
    }

    // ── 状态 ──────────────────────────────────────────────────────

    private fun select(item: Item) {
        // 点当前项不重新加载，只回到顶部（安卓/iOS 都是这个肌肉记忆）
        if (item.key == activeKey) {
            onReselect?.invoke(item)
            return
        }
        setActive(item.key, animate = true)
        onSelect?.invoke(item)
    }

    /** 网页前进 / 后退 / 客户端跳转后同步高亮；不认识的路径保持原样，避免整条栏来回跳 */
    fun sync(url: String?) {
        val key = keyFor(url) ?: return
        if (key == activeKey) return
        setActive(key, animate = false)
    }

    /**
     * 只有五个主 tab 的根路径才挂底栏 —— 与网页 `components/tabbar.tsx` 的
     * `isTabRoot` 同一套规则。详情页（/p/、/resources/xxx、/wiki/xxx…）全屏显示。
     */
    private fun keyFor(url: String?): String? {
        val path = runCatching { android.net.Uri.parse(url ?: return null).path }.getOrNull() ?: return null
        return when {
            path.isEmpty() || path == "/" -> "home"
            path.startsWith("/resources") -> "resources"
            path.startsWith("/servers") -> "servers"
            path.startsWith("/wiki") -> "wiki"
            path.startsWith("/me") || path.startsWith("/u/") -> "me"
            else -> null
        }
    }

    private fun setActive(key: String, animate: Boolean) {
        activeKey = key
        paintAll(animate)
        moveGlider(animate)
    }

    private fun paintAll(animate: Boolean) {
        holders.forEach { holder -> paint(holder, holder.item.key == activeKey, animate) }
    }

    private fun paint(holder: Holder, active: Boolean, animate: Boolean) {
        // M3：选中时图标是 on-secondary-container，文字是 on-surface；
        // 未选中两者都是 on-surface-variant。不再做「图标上浮放大」的小把戏。
        holder.icon.setColorFilter(if (active) onIndicator else onVariant)
        holder.label.setTextColor(if (active) onSurface else onVariant)
        holder.label.typeface = if (active) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
        holder.root.isSelected = active
        holder.root.contentDescription =
            if (active) "${holder.item.label}（当前）" else holder.item.label

        if (animate) {
            holder.icon.animate().cancel()
            holder.icon.animate()
                .alpha(1f)
                .setDuration(160)
                .setInterpolator(PathInterpolator(0.2f, 0f, 0f, 1f))
                .start()
        } else {
            holder.icon.alpha = 1f
        }

        if (animate && active) holder.root.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK)
    }

    /** 指示器滑到当前项：用两者在窗口里的绝对坐标相减，手算层级容易把 padding 算两遍 */
    private fun moveGlider(animate: Boolean) {
        val holder = holders.firstOrNull { it.item.key == activeKey } ?: return
        if (holder.pill.width == 0) return
        val navLoc = IntArray(2).also { getLocationInWindow(it) }
        val pillLoc = IntArray(2).also { holder.pill.getLocationInWindow(it) }
        val x = pillLoc[0] - navLoc[0]
        val y = pillLoc[1] - navLoc[1]

        glider.animate().cancel()
        if (animate && gliderReady) {
            glider.animate()
                .translationX(x.toFloat())
                .translationY(y.toFloat())
                .alpha(1f)
                .setDuration(240)
                .setInterpolator(PathInterpolator(0.2f, 0f, 0f, 1f))
                .start()
        } else {
            glider.animate().cancel()
            glider.translationX = x.toFloat()
            glider.translationY = y.toFloat()
            glider.alpha = 1f
        }
        gliderReady = true
    }

    /** 站内主题切换时跟着换色（网页写 `data-theme`，注入脚本会通知原生） */
    fun applyTheme(dark: Boolean) {
        navBg = ContextCompat.getColor(context, if (dark) R.color.m3_nav_dark else R.color.m3_nav_light)
        lineColor = ContextCompat.getColor(context, if (dark) R.color.m3_outline_dark else R.color.m3_outline_light)
        indicator = ContextCompat.getColor(context, if (dark) R.color.m3_indicator_dark else R.color.m3_indicator_light)
        onIndicator = ContextCompat.getColor(context, if (dark) R.color.m3_on_indicator_dark else R.color.m3_on_indicator_light)
        onSurface = ContextCompat.getColor(context, if (dark) R.color.m3_on_surface_dark else R.color.m3_on_surface_light)
        onVariant = ContextCompat.getColor(context, if (dark) R.color.m3_on_variant_dark else R.color.m3_on_variant_light)
        ripple = indicator

        surface.setColor(navBg)
        topLine.setBackgroundColor(lineColor)
        gliderBg.setColor(indicator)
        paintAll(animate = false)
        invalidate()
    }

    private fun dp(v: Int): Int = (v * density).toInt()
}
