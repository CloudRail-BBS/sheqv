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
 * 原生底部导航 —— 视觉与网页的 tabbar 对齐：悬浮毛玻璃胶囊 + 滑动高亮块。
 *
 * 为什么还要原生重画一遍：网页那条随内容滚动重绘，在 WebView 里会跟页面一起抖；
 * 原生画同样的几何与配色，既保住识别度，又能吃到系统按压反馈、无障碍语义，
 * 以及「再点一次回到顶部」这类安卓习惯。
 *
 * 几何取自 `globals.css` 的 `.tabbar`：左右 10、底部 10、内边距 6、圆角 26；
 * 高亮块 46×28、圆角 12、蓝底蓝边，切换 300ms 滑动（cubic-bezier(.4,0,.2,1)）。
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
    private val glider = View(context)
    private var gliderBg: GradientDrawable
    private val capsule: GradientDrawable

    private val density = resources.displayMetrics.density
    private val onColor = ContextCompat.getColor(context, R.color.brand)
    private var offColor = ContextCompat.getColor(context, R.color.nav_off_light)
    private var gliderColor = ContextCompat.getColor(context, R.color.nav_glider_light)
    private var gliderLine = ContextCompat.getColor(context, R.color.nav_glider_line_light)
    private var glassColor = ContextCompat.getColor(context, R.color.nav_glass_light)
    private var glassLine = ContextCompat.getColor(context, R.color.nav_glass_line_light)

    private var gliderReady = false

    init {
        setWillNotDraw(false)
        capsule = rounded(26, glassColor, glassLine)
        background = capsule
        // 悬浮层：柔和投影，和网页那条 `0 18px 40px -22px` 的观感对齐
        elevation = 12 * density
        clipToOutline = true

        gliderBg = rounded(12, gliderColor, gliderLine)
        glider.background = gliderBg
        glider.alpha = 0f

        rowStrip.orientation = LinearLayout.HORIZONTAL
        rowStrip.gravity = Gravity.CENTER_VERTICAL
        rowStrip.setPadding(dp(6), dp(6), dp(6), dp(6))

        buildItems()
        addView(glider, LayoutParams(dp(46), dp(28)).apply { gravity = Gravity.TOP or Gravity.START })
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
                    ColorStateList.valueOf(ContextCompat.getColor(context, R.color.nav_pill_light)),
                    null,
                    rounded(18, Color.WHITE, null),
                )
            }

            val pill = FrameLayout(context).apply {
                layoutParams = LinearLayout.LayoutParams(dp(46), dp(28))
            }
            val icon = ImageView(context).apply {
                setImageResource(item.icon)
                layoutParams = LayoutParams(dp(21), dp(21), Gravity.CENTER)
                setColorFilter(offColor)
            }
            pill.addView(icon)

            val label = TextView(context).apply {
                text = item.label
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f)
                gravity = Gravity.CENTER
                setTextColor(offColor)
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
        val ink = if (active) onColor else offColor
        holder.icon.setColorFilter(ink)
        holder.label.setTextColor(ink)
        holder.label.typeface = if (active) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
        holder.root.isSelected = active
        holder.root.contentDescription =
            if (active) "${holder.item.label}（当前）" else holder.item.label

        // 网页里选中项图标会轻微上浮放大（translateY(-1px) scale(1.08)），节奏保持一致
        val lift = if (active) -density else 0f
        val scale = if (active) 1.08f else 1f
        if (animate) {
            holder.icon.animate().cancel()
            holder.icon.animate()
                .translationY(lift)
                .scaleX(scale)
                .scaleY(scale)
                .setDuration(220)
                .setInterpolator(PathInterpolator(0.4f, 0f, 0.2f, 1f))
                .start()
        } else {
            holder.icon.translationY = lift
            holder.icon.scaleX = scale
            holder.icon.scaleY = scale
        }

        if (animate && active) holder.root.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK)
    }

    /** 高亮块滑到当前项：用两者在窗口里的绝对坐标相减，手算层级容易把 padding 算两遍 */
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
                .setDuration(300)
                .setInterpolator(PathInterpolator(0.4f, 0f, 0.2f, 1f))
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
        glassColor = ContextCompat.getColor(context, if (dark) R.color.nav_glass_dark else R.color.nav_glass_light)
        glassLine = ContextCompat.getColor(context, if (dark) R.color.nav_glass_line_dark else R.color.nav_glass_line_light)
        offColor = ContextCompat.getColor(context, if (dark) R.color.nav_off_dark else R.color.nav_off_light)
        gliderColor = ContextCompat.getColor(context, if (dark) R.color.nav_glider_dark else R.color.nav_glider_light)
        gliderLine = ContextCompat.getColor(context, if (dark) R.color.nav_glider_line_dark else R.color.nav_glider_line_light)

        capsule.setColor(glassColor)
        capsule.setStroke(dp(1), glassLine)
        gliderBg.setColor(gliderColor)
        gliderBg.setStroke(dp(1), gliderLine)
        paintAll(animate = false)
        invalidate()
    }

    private fun rounded(radiusDp: Int, fill: Int, stroke: Int?): GradientDrawable =
        GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = radiusDp * density
            setColor(fill)
            if (stroke != null) setStroke(dp(1), stroke)
        }

    private fun dp(v: Int): Int = (v * density).toInt()
}
