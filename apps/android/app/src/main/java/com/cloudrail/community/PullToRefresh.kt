package com.cloudrail.community

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.util.AttributeSet
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ProgressBar
import androidx.core.content.ContextCompat
import kotlin.math.abs
import kotlin.math.min

/**
 * 下拉刷新（自己实现，不引第三方库）。
 *
 * 站点的正文滚动发生在网页自己的 `.site-scroll` 容器里，WebView 本身不滚，
 * 所以「是否到顶」不能问 WebView，只能读注入脚本上报的滚动位置。
 *
 * 交互按安卓习惯来：只在到顶时接管竖直下拉，横向滑动与页面内滚动完全不受影响；
 * 松手未过阈值回弹，过了阈值转圈并回调，页面加载完由 Activity 收起。
 */
class PullToRefresh @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : FrameLayout(context, attrs) {

    /** 网页上报的滚动位置；返回 > 0 表示不在顶部，不接管触摸 */
    var pageScrollTop: (() -> Int)? = null
    var onRefresh: (() -> Unit)? = null

    var isRefreshing: Boolean = false
        set(value) {
            if (field == value) return
            field = value
            if (value) {
                offset = trigger
                applyOffset()
                spinner.visibility = View.VISIBLE
            } else {
                spinner.visibility = View.GONE
                animateTo(0f)
            }
        }

    private val density = resources.displayMetrics.density
    private val trigger = 64 * density
    private val maxOffset = 96 * density
    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop

    private lateinit var indicator: FrameLayout
    private lateinit var spinner: ProgressBar
    private var indicatorBg: GradientDrawable? = null

    private var offset = 0f
    private var dragging = false
    private var downY = 0f
    private var downX = 0f
    private var dragAnim: ValueAnimator? = null

    // ── 构建 ──────────────────────────────────────────────────────

    override fun onFinishInflate() {
        super.onFinishInflate()
        buildIndicator()
    }

    private fun buildIndicator() {
        spinner = ProgressBar(context).apply {
            layoutParams = LayoutParams(dp(18), dp(18), Gravity.CENTER)
            indeterminateTintList =
                android.content.res.ColorStateList.valueOf(ContextCompat.getColor(context, R.color.brand))
            visibility = View.GONE
        }
        indicatorBg = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(ContextCompat.getColor(context, R.color.panel_light))
            setStroke(dp(1), ContextCompat.getColor(context, R.color.nav_line_light))
        }
        indicator = FrameLayout(context).apply {
            layoutParams = LayoutParams(dp(34), dp(34), Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply {
                topMargin = dp(12)
            }
            background = indicatorBg
            elevation = dp(4).toFloat()
            alpha = 0f
            isClickable = false
            isFocusable = false
            addView(spinner)
        }
        addView(indicator)
    }

    // ── 触摸 ──────────────────────────────────────────────────────

    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
        if (isRefreshing) return false
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = ev.x
                downY = ev.y
                dragging = false
            }

            MotionEvent.ACTION_MOVE -> {
                if (dragging) return true
                val dy = ev.y - downY
                val dx = ev.x - downX
                // 只接「到顶 + 竖直向下 + 超过手滑容差」这一种，横滑照样给轮播
                if (dy > touchSlop && dy > abs(dx) * 1.2f && canPull()) {
                    dragging = true
                    downY = ev.y - touchSlop
                    return true
                }
            }

            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> dragging = false
        }
        return false
    }

    override fun onTouchEvent(ev: MotionEvent): Boolean {
        if (!dragging) return false
        when (ev.actionMasked) {
            MotionEvent.ACTION_MOVE -> {
                val dy = ev.y - downY
                offset = (dy * 0.55f).coerceIn(0f, maxOffset)
                applyOffset()
            }

            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                dragging = false
                if (offset >= trigger && !isRefreshing) {
                    isRefreshing = true
                    onRefresh?.invoke()
                } else {
                    animateTo(0f)
                }
            }
        }
        return true
    }

    private fun canPull(): Boolean = (pageScrollTop?.invoke() ?: 0) <= 0

    // ── 位移与动画 ────────────────────────────────────────────────

    private fun applyOffset() {
        val content = content() ?: return
        content.translationY = offset
        val p = (offset / trigger).coerceIn(0f, 1f)
        indicator.alpha = if (offset <= 0f) 0f else min(1f, p + 0.25f)
        indicator.translationY = offset * 0.5f - dp(34)
    }

    private fun animateTo(target: Float) {
        dragAnim?.cancel()
        val content = content() ?: return
        val from = offset
        dragAnim = ValueAnimator.ofFloat(from, target).apply {
            duration = 200
            interpolator = DecelerateInterpolator()
            addUpdateListener {
                offset = it.animatedValue as Float
                content.translationY = offset
                val p = (offset / trigger).coerceIn(0f, 1f)
                indicator.alpha = if (offset <= 0f) 0f else min(1f, p + 0.25f)
                indicator.translationY = offset * 0.5f - dp(34)
            }
            start()
        }
    }

    private fun content(): View? = getChildAt(0)?.takeIf { it !== indicator }

    // ── 主题 ──────────────────────────────────────────────────────

    fun applyTheme(dark: Boolean) {
        setBackgroundColor(
            ContextCompat.getColor(context, if (dark) R.color.panel_dark else R.color.panel_light),
        )
        indicatorBg?.let {
            it.setColor(ContextCompat.getColor(context, if (dark) R.color.nav_bg_dark else R.color.nav_bg_light))
            it.setStroke(
                dp(1),
                ContextCompat.getColor(context, if (dark) R.color.nav_line_dark else R.color.nav_line_light),
            )
        }
    }

    private fun dp(v: Int): Int = (v * density).toInt()
}
