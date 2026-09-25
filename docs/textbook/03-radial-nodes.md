# 第 3 章 径向分布与节点

第 2 章把类氢波函数分成径向部分 $R_{n\ell}(r)$ 与角向部分 $Y_\ell^m(\theta,\phi)$。这一章只追问与半径有关的问题：
电子最可能出现在哪个半径？平均半径有多大？波函数在哪些地方为零？回答它们的关键，是把径向函数、它的平方和
径向分布这三个对象分清楚。

## 学习目标 {#goals}

读完本章，你应当能够：

- 区分径向函数 $R_{n\ell}$、它的平方 $\lvert R_{n\ell}\rvert^2$ 和径向分布 $P(r)$；
- 求最可几半径和平均半径 $\langle r\rangle$；
- 数出径向节点与角向节点的个数，并确定它们的位置；
- 读懂实验室详情面板的「图表」标签页。

## 径向函数 {#radial-function}

第 2 章总公式中的 $\rho^\ell$ 决定了 $R_{n\ell}$ 在原点附近的行为。广义 Laguerre 多项式在 $\rho=0$ 处不为零，
所以 $r\to0$ 时 $R_{n\ell}(r)\propto r^\ell$。只有 $s$ 态（$\ell=0$）在原子核处 $\psi\ne0$；$\ell\ge1$ 的态在原子核处 $\psi=0$。
径向方程里的离心项正比于 $\ell(\ell+1)/r^2$，在原点附近压过库仑吸引，把 $\ell\ge1$ 的电子推离原子核
[@griffiths2018qm, ch. 4 (pp. 131--197)]。

取 $Z=a_\mu=1$（长度以 $a_0$ 计），最简单的三个径向函数是

$$
R_{10}=2e^{-r},\qquad R_{20}=\frac{1}{2\sqrt2}(2-r)\,e^{-r/2},\qquad R_{21}=\frac{1}{2\sqrt6}\,r\,e^{-r/2}
$$

$R_{10}$ 与 $R_{20}$ 在原点不为零，$R_{21}$ 正比于 $r$。$R_{20}$ 在 $r>2$ 时变为负值：径向函数有正负号，
这一点在实部切片上看得见（图 3.2）。

## 径向分布 {#radial-distribution}

由第 1 章的体积元，

$$
dP=\lvert R_{n\ell}(r)\rvert^2r^2\,dr\cdot\lvert Y_\ell^m(\theta,\phi)\rvert^2\sin\theta\,d\theta\,d\phi
$$

对两个角度积分时，球谐函数的归一化 $\int\lvert Y_\ell^m\rvert^2\sin\theta\,d\theta\,d\phi=1$ 让角向部分积成 1，
剩下的就是半径落在 $[r,r+dr]$ 这层薄球壳里的概率 $P(r)\,dr$：

$$
P(r)=r^2\lvert R_{n\ell}(r)\rvert^2,\qquad \int_0^\infty P(r)\,dr=1
$$

三个对象回答的是不同的问题：

| 对象 | 含义 | 在原点 |
|---|---|---|
| $R_{n\ell}(r)$ | 径向波函数，有正负号 | $s$ 态不为零，其余为零 |
| $\lvert R_{n\ell}(r)\rvert^2$ | 沿固定方向时正比于局域概率密度 $\lvert\psi\rvert^2$ | $s$ 态不为零，其余为零 |
| $P(r)=r^2\lvert R_{n\ell}\rvert^2$ | 单位半径厚度的球壳内的概率 | 总为零 |

实验室详情面板的「图表」标签页画的就是 $P(r)$：竖线标出径向节点，另有两个标记分别指出 $\langle r\rangle$ 和最可几半径。
这些数值都由生成场景的同一套 Python 代码算出，浏览器只负责绘制。

## 最可几半径 {#most-probable-radius}

最可几半径 $r_{\mathrm{mp}}$ 是 $P(r)$ 的最大值所在的半径，不是 $\lvert R\rvert^2$ 或 $\lvert\psi\rvert^2$ 的最大值所在处。

- **$1s$**：$P\propto r^2e^{-2Zr/a_\mu}$。令 $\tfrac{dP}{dr}=0$，得 $2r-\tfrac{2Z}{a_\mu}r^2=0$，所以
  $r_{\mathrm{mp}}=a_\mu/Z$；对氢原子就是 $a_0$。
- **$\ell=n-1$ 的态**（$1s,2p,3d,4f$）：Laguerre 多项式的次数为 0，只是一个常数，所以
  $R\propto r^{n-1}e^{-Zr/(na_\mu)}$，$P\propto r^{2n}e^{-2Zr/(na_\mu)}$，最大值在 $r=n^2a_\mu/Z$，
  即 1、4、9、16 $a_0$。这恰好是 Bohr 模型的轨道半径，但只对 $\ell=n-1$ 成立；其他态的最可几半径见本章末的径向数据表。

与此对照，$1s$ 的局域概率密度 $\lvert\psi_{1s}\rvert^2\propto e^{-2Zr/a_\mu}$ 在原子核处最大。两者并不矛盾：
$\lvert\psi\rvert^2$ 是单位体积内的概率，而半径为 $r$ 的薄球壳体积 $4\pi r^2dr$ 随 $r$ 增大，乘上这个体积之后，
峰值就移到了 $a_\mu/Z$。

## 平均半径 {#mean-radius}

平均半径是 $r$ 在 $P(r)$ 下的期望值。把类氢径向函数 [@griffiths2018qm, ch. 4 (pp. 131--197)] 代入积分，可得闭合形式：

$$
\langle r\rangle=\int_0^\infty r\,P(r)\,dr=\frac{a_\mu}{2Z}\left[3n^2-\ell(\ell+1)\right]
$$

- 主项 $3n^2a_\mu/(2Z)$ 随 $n^2$ 增长，激发态迅速变大；
- 固定 $n$ 时，$\ell$ 越大，$\langle r\rangle$ 越小：$3s,3p,3d$ 依次是 13.5、12.5、10.5 $a_0$；
- 平均半径一般不等于最可几半径。$1s$ 的 $\langle r\rangle=1.5\,a_0$，比 $r_{\mathrm{mp}}=a_0$ 大，
  因为 $P(r)$ 在峰值外侧有一条长尾，把平均值拉向外侧。

## 径向节点 {#radial-nodes}

径向节点是 $R_{n\ell}=0$ 的半径（不计原点）。它们来自 Laguerre 多项式 $L_{n-\ell-1}^{2\ell+1}(\rho)$ 的根：
若 $\rho_k$ 是一个根，节点就在 $r=na_\mu\rho_k/(2Z)$。例如 $3p$ 的 $L_1^3(\rho)=4-\rho$ 的根是 $\rho=4$，取 $Z=a_\mu=1$ 时
节点却在 $r=6a_0$。在节点所在的整个球面上 $\psi=0$，$P(r)$ 也在那里降到零。节点的个数是

$$
N_{\mathrm{radial}}=n-\ell-1
$$

用第 2 章的 $\sigma=Zr/a_\mu$ 写出几个例子（取 $Z=a_\mu=1$ 时，$\sigma$ 就是以 $a_0$ 为单位的 $r$）：

- $2s$：$R_{20}\propto(2-\sigma)e^{-\sigma/2}$，节点在 $\sigma=2$，即 $2a_0$；
- $3s$：$R_{30}\propto(27-18\sigma+2\sigma^2)e^{-\sigma/3}$，节点在 $\sigma=(9\mp3\sqrt3)/2$，即约 $1.902\,a_0$ 与 $7.098\,a_0$；
- $3p$：$R_{31}\propto\sigma(6-\sigma)e^{-\sigma/3}$，节点在 $6a_0$；
- $4d$：$R_{42}\propto\sigma^2(12-\sigma)e^{-\sigma/4}$，节点在 $12a_0$。

节点半径全部按 $a_\mu/Z$ 缩放 [@griffiths2018qm, ch. 4 (pp. 131--197); @dlmf-laguerre, eq. 18.5.12]。
节点位置是检验公式的灵敏指标：有一份公开的动画源码把 $3p$ 的多项式错写成 $4\sigma-2\sigma^2$，节点就落到了
$\sigma=2$，详见[纠错账本](../references/corrections.md)。

在平面切片上，节点球面与平面相交成一个圆，所以径向节点表现为以原子核为圆心的暗环。

<figure class="quviz-figure" data-lab="mode=eigenstate&n=3&l=0&m=0&basis=real&rep=slice&plane=xz&obs=probability_density" markdown>
**图 3.1** $3s$ 在 $xz$ 平面上的概率密度：两圈暗环是 $r\approx1.90\,a_0$ 与 $r\approx7.10\,a_0$ 处的径向节点，个数 $n-\ell-1=2$。内圈暗环离原子核很近：教材版切片的采样间距约 $1.16\,a_0$，没有采样点正好落在 $1.90\,a_0$ 上，所以内圈只是一圈比两侧暗的像素，亮度与最外一瓣相当，不像外圈那样几乎降到底色。
</figure>

## 角向节点 {#angular-nodes}

角向节点来自 $Y_\ell^m$ 的零点。在实基中有 $\ell$ 个角向节点面，加上径向节点，总数是

$$
N_{\mathrm{total}}=(n-\ell-1)+\ell=n-1
$$

角向节点不一定是平面。$d_{z^2}$ 的角向因子 $\propto3\cos^2\theta-1$ 在 $\cos\theta=\pm1/\sqrt3$ 处为零，
也就是 $\theta\approx54.7^\circ$ 与 $125.3^\circ$ 的两个圆锥面；所以 $d_{z^2}$ 是两瓣加一个环，而不是四瓣
[@dlmf-spherical-harmonics, eq. 14.30.3]。

复基的情况又不同。复球谐函数带有因子 $e^{im\phi}$，它的模恒为 1，没有零点；实基里的方位节点面在复基中变成了
相位绕 $z$ 轴的绕转。因此“$\ell$ 个角向节点面、共 $n-1$ 个节点”是实基中的计数，不能不看基就套用
[@dlmf-spherical-harmonics, §14.30]。

$3p_z$ 同时有一个径向节点（$r=6a_0$）和一个角向节点面（$z=0$），在实部切片上两者都表现为符号翻转：

<figure class="quviz-figure" data-lab="mode=eigenstate&n=3&l=1&m=0&basis=real&rep=slice&plane=xz&obs=wavefunction_real" markdown>
**图 3.2** $3p_z$ 在 $xz$ 平面上的 $\operatorname{Re}\psi$（红为正、青为负）：符号在 $z=0$ 的节面两侧翻转，也在 $r=6a_0$ 的径向节点两侧翻转，所以上下两侧各有红青相间的内外两层。在 QuViz 的相位约定下，上方内层为红、外层为青，下方正好相反。
</figure>

## 径向数据表 {#radial-table}

下表取 $Z=1$、$a_\mu=1$，长度以 $a_0$ 计：

| 态 | 径向节点 $r/a_0$ | 最可几半径 $r_{\mathrm{mp}}/a_0$ | $\langle r\rangle/a_0$ |
|---|---|---|---|
| $1s$ | — | 1 | 1.5 |
| $2s$ | 2 | 5.236 | 6 |
| $2p$ | — | 4 | 5 |
| $3s$ | 1.902, 7.098 | 13.07 | 13.5 |
| $3p$ | 6 | 12 | 12.5 |
| $3d$ | — | 9 | 10.5 |
| $4s$ | 1.872, 6.611, 15.52 | 24.62 | 24 |
| $4p$ | 5.528, 14.47 | 23.58 | 23 |
| $4d$ | 12 | 21.21 | 21 |
| $4f$ | — | 16 | 18 |

这些数值与 $m$ 和基的选择都无关，因为它们只来自径向函数 $R_{n\ell}$。对其他的 $Z$ 和 $a_\mu$，表中所有长度都乘以 $a_\mu/Z$。

## 常见误区 {#misconceptions}

!!! warning "误区：最可几半径就是 |ψ|² 最大的地方"

    不是。$\lvert\psi\rvert^2$ 是单位体积内的概率，最可几半径是 $P(r)=r^2\lvert R\rvert^2$ 的峰值。对 $1s$，
    $\lvert\psi\rvert^2$ 在原子核处最大，而 $r_{\mathrm{mp}}=a_0$。有一段科普视频没有稳定标明体积元，
    在这两种分布之间来回切换 [@floatheadphysics2025-orbitals, 06:06--10:00]；具体分析见[纠错账本](../references/corrections.md)。

!!! warning "误区：平均半径等于最可几半径"

    一般不相等，而且谁大谁小也不固定：$1s$ 的 $\langle r\rangle=1.5\,a_0$ 大于 $r_{\mathrm{mp}}=a_0$，
    $4s$ 的 $\langle r\rangle=24\,a_0$ 却小于 $r_{\mathrm{mp}}\approx24.62\,a_0$（思考题 3.4）。

!!! warning "误区：角向节点都是平面"

    角向节点数只规定零点曲面的个数，不规定它们的形状。$d_{z^2}$ 的两个角向节点是 $\cos\theta=\pm1/\sqrt3$ 的
    两个圆锥面 [@dlmf-spherical-harmonics, eq. 14.30.3]。

!!! warning "误区：电子要想办法「穿过」节点"

    这个问题默认电子沿一条轨迹，从节点的一侧运动到另一侧。定态并没有这样的轨迹：量子力学只给出在各处找到电子的
    概率，节点两侧的概率属于同一个不随时间变化的分布，并不存在“先在内侧、后到外侧”的过程。节点处概率密度为零，
    只说明在节点附近找到电子的概率很小；“穿过”这个说法本身就预设了轨迹。

## 思考题 {#exercises}

??? question "思考题 3.1：求 1s 的最可几半径"

    取 $Z=a_\mu=1$，$P(r)=4r^2e^{-2r}$。令

    $$
    \frac{d}{dr}\left(r^2e^{-2r}\right)=(2r-2r^2)\,e^{-2r}=0,
    $$

    除 $r=0$ 外的解是 $r=1$，即 $r_{\mathrm{mp}}=a_0$。

??? question "思考题 3.2：求 2s 与 3p 的径向节点"

    $R_{20}\propto(2-\sigma)e^{-\sigma/2}$ 在 $\sigma=2$ 处为零；$R_{31}\propto\sigma(6-\sigma)e^{-\sigma/3}$ 除原点外
    只在 $\sigma=6$ 处为零。所以氢原子的节点分别在 $2a_0$ 与 $6a_0$，个数都是 $n-\ell-1=1$。

??? question "思考题 3.3：比较 3s、3p、3d 的平均半径与最可几半径"

    $\langle r\rangle/r_{\mathrm{mp}}$ 依次是 $13.5/13.07$、$12.5/12$、$10.5/9$（单位 $a_0$）。
    两个量都随 $\ell$ 增大而减小：同一个 $n$ 下，$\ell$ 越大，分布的整体尺度越小。整体尺度小不等于更靠近原子核：
    $r\lt a_0$ 以内，$3s$ 的概率约为 $1\,\%$，$3d$ 只有约 $6.5\times10^{-6}$，$s$ 态的内侧小瓣最深入原子核附近。

??? question "思考题 3.4：为什么 4s 的最可几半径（24.62 a₀）反而大于平均半径（24 a₀）？"

    $4s$ 有 3 个径向节点，$P(r)$ 分成四瓣。最外一瓣占 83.4 % 的概率，峰值 $r_{\mathrm{mp}}\approx24.62\,a_0$
    就在这一瓣里。单看这一瓣，它自身的平均半径约为 $26.97\,a_0$，比峰值还远，这是峰值外那条长尾的作用。
    内侧三瓣合计占 16.6 %，全都在 $15.52\,a_0$ 以内，把总平均拉回到 $24\,a_0$。对 $4s$，内侧三瓣的作用占了上风。
    作为对照，$3s$ 的内侧两瓣只占 11.5 %，外侧的长尾占上风，$\langle r\rangle=13.5\,a_0$ 大于
    $r_{\mathrm{mp}}\approx13.07\,a_0$。

??? question "思考题 3.5：数一数实基 4d_xy 的节点"

    径向节点 $n-\ell-1=1$ 个，在 $12a_0$。角向部分 $\propto xy/r^2$，在 $x=0$ 与 $y=0$ 两个平面上为零，
    所以有 2 个角向节点面。总数 $1+2=3=n-1$。

## 延伸阅读 {#further-reading}

- [坐标与概率测度](../concepts/coordinate-measures.md)：球坐标下的概率测度，以及“中心最密不等于最可能半径”；
- [氢与类氢轨道](../tutorials/hydrogenic-orbitals.md)：总公式与节点计数，包括 $d_{z^2}$ 圆锥节点的讨论；
- [纠错账本](../references/corrections.md)：公开资料中与径向分布、节点有关的已确认错误；
- [第 2 章](02-hydrogen-levels.md)：量子数、能级与总公式。

径向方程与氢原子波函数的推导见 Griffiths 与 Schroeter 教材第 4 章，Laguerre 多项式的性质见 DLMF
[@griffiths2018qm, ch. 4 (pp. 131--197); @dlmf-laguerre, eq. 18.5.12]。
