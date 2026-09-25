# 第 4 章 实轨道与复轨道

第 2 章用复球谐函数 $Y_\ell^m$ 写出了类氢波函数的总公式，而化学书上画的 $p_x$、$p_y$、$d_{xy}$ 却都是实函数。
这一章说明两者的关系：它们是同一个子空间里的两组基，彼此由幺正变换联系。换基不改变任何物理：同一个态无论用哪组基展开，
可观测量都一样。改变的是被选作基的那些函数：复基 $m=+1$ 的态与 $p_x$ 是两个不同的态，形状、概率流（第 8 章）不同，
磁量子数 $m$ 能不能读成 $L_z$ 的测量结果也不同。最后一节说明实验室怎样用颜色表示相位。

## 学习目标 {#goals}

读完本章，你应当能够：

- 说明复球谐函数 $Y_\ell^m$ 是 $\hat L_z$ 的本征态，而且它给出的密度与方位角 $\phi$ 无关；
- 把 $p_x$ 与 $p_y$ 写成 $m=\pm1$ 两个复基态的线性组合；
- 认识到在简并子空间内换基是一次幺正变换，而不是新的物理；
- 读懂实验室中的相位颜色。

## 复球谐：角动量本征态 {#complex-harmonics}

复基使用标准的复球谐函数：

$$
Y_\ell^m(\theta,\phi)\propto P_\ell^{\lvert m\rvert}(\cos\theta)\,e^{im\phi},\qquad \hat L_z Y_\ell^m=\hbar m\,Y_\ell^m
$$

其中 $\hat L_z=-i\hbar\,\partial/\partial\phi$ 是角动量的 $z$ 分量。第二个式子说明，在复基中 $m$ 是 $L_z/\hbar$ 的本征值：
对复基态 $\psi_{n\ell m}=R_{n\ell}Y_\ell^m$ 测量 $L_z$，结果必定是 $m\hbar$ [@dlmf-spherical-harmonics, eqs. 14.30.3, 14.30.6, and 14.30.11_5]。

- **密度与 $\phi$ 无关。** $\phi$ 只出现在因子 $e^{im\phi}$ 中，而 $\lvert e^{im\phi}\rvert^2=1$，所以 $\lvert Y_\ell^m\rvert^2$ 只依赖 $\theta$，
  整个密度绕 $z$ 轴旋转对称。$Y_\ell^{m}$ 与 $Y_\ell^{-m}$ 的密度完全相同。
- **相位绕 $z$ 轴转动。** 沿绕 $z$ 轴的一圈，$\phi$ 从 0 增加到 $2\pi$，相位随 $m\phi$ 转过 $\lvert m\rvert$ 整圈，$m$ 的正负决定转动方向。
- **Condon–Shortley 相位。** QuViz 的 $Y_\ell^m$ 含 Condon–Shortley 相位。例如 $Y_1^{1}=-\sqrt{3/(8\pi)}\,\sin\theta\,e^{i\phi}$
  带一个负号，而 $Y_1^{-1}=+\sqrt{3/(8\pi)}\,\sin\theta\,e^{-i\phi}$ 没有。这个负号不改变密度，却决定了画面上的颜色（本章最后一节）。

<figure class="quviz-figure" data-lab="mode=eigenstate&n=2&l=1&m=1&basis=complex&rep=isosurface" markdown>
**图 4.1** 复基 $2p$、$m=+1$ 的等密度面：密度 $\lvert\psi\rvert^2=r^2e^{-r}\sin^2\theta/(64\pi)$（原子单位），与方位角 $\phi$ 无关，所以曲面绕 $z$ 轴旋转对称、呈环状；颜色（相位）绕 $z$ 轴连续转过一整圈。环中间的孔很细，向两极张开成漏斗形的凹陷：密度在整条 $z$ 轴上严格为零，曲面不会穿过 $z$ 轴。由于 Condon–Shortley 相位，$+x$ 方向为青色（相位 $\pi$），$-x$ 方向为红色（相位 0）。
</figure>

## 实球谐：化学定向轨道 {#real-harmonics}

QuViz 的实基按下式由复球谐构造（第 2 章已经用过这个定义）：

$$
Y_{\ell m}^{\mathrm{real}}=
\begin{cases}
\sqrt2(-1)^m\operatorname{Re}Y_\ell^m,&m>0,\\
Y_\ell^0,&m=0,\\
\sqrt2(-1)^m\operatorname{Im}Y_\ell^{\lvert m\rvert},&m<0.
\end{cases}
$$

球谐函数由 SciPy 的 `sph_harm_y` 求值，其中含 Condon–Shortley 相位 [@scipy-sph-harm-y]。定义中的因子 $(-1)^m$ 正好抵消这个相位带来的
负号，所以 $\ell=1$ 时 $m=1,-1,0$ 依次给出 $p_x,p_y,p_z$，而且 $p_x$ 在 $+x$ 一侧为正、$p_y$ 在 $+y$ 一侧为正。

把这三个实球谐简记为 $p_x,p_y,p_z$，它们与复球谐的关系是

$$
p_x=\frac{Y_1^{-1}-Y_1^{1}}{\sqrt2},\qquad p_y=\frac{i\,(Y_1^{-1}+Y_1^{1})}{\sqrt2},\qquad p_z=Y_1^0
$$

代入上一节的 $Y_1^{\pm1}$，得到 $p_x=\sqrt{3/(4\pi)}\,\sin\theta\cos\phi\propto x/r$，$p_y=\sqrt{3/(4\pi)}\,\sin\theta\sin\phi\propto y/r$。
$e^{i\phi}$ 与 $e^{-i\phi}$ 的两种组合分别给出 $\cos\phi$ 与 $\sin\phi$：两个相位转向相反的复基态叠加起来，得到一个相位不再转动、
在一个节面两侧符号相反的实函数。乘上同一个径向函数 $R_{n1}$，这些关系对完整的波函数同样成立。

<figure class="quviz-figure" data-lab="mode=eigenstate&n=2&l=1&m=1&basis=real&rep=isosurface" markdown>
**图 4.2** 实基 $2p_x$ 的等密度面：两瓣沿 $x$ 轴，一红一青，相位相差 $\pi$。它是 $m=+1$ 与 $m=-1$ 两个复基态的线性组合。$+x$ 一侧为红色（相位 0），$-x$ 一侧为青色（相位 $\pi$）。
</figure>

## 基变换不是新物理 {#basis-change}

固定 $n$ 和 $\ell$，$2\ell+1$ 个态 $\psi_{n\ell m}$ 张成一个子空间，其中每个态的能量都是 $E_n$。在这个子空间里换一组基，
就是做一次幺正变换：

$$
\tilde\phi_i=\sum_jU_{ij}\phi_j,\qquad U^\dagger U=I
$$

上一节的 $p_x,p_y,p_z$ 正是由 $Y_1^{1},Y_1^{0},Y_1^{-1}$ 经过一个 $3\times3$ 的幺正矩阵得到的。换基改变的是单个基函数的样子，
不改变子空间本身：新基中的每个函数仍是能量为 $E_n$ 的本征态，子空间中的任何态也都可以用任一组基展开。
所以 QuViz 把「实基 / 复基」当作描述量子态的一个选项，而不是一个新的量子数。

一个直接的检验是 Unsöld 定理：

$$
\sum_{m=-\ell}^{\ell}\lvert Y_\ell^m\rvert^2=\frac{2\ell+1}{4\pi}
$$

同一个 $\ell$ 的全部 $2\ell+1$ 个函数，密度之和与方向无关；把求和换成实基的 $\sum_m\lvert Y_{\ell m}^{\mathrm{real}}\rvert^2$，结果也不变
[@dlmf-spherical-harmonics, §14.30]。原因正是幺正性：由 $U^\dagger U=I$ 可得 $\sum_i\lvert\tilde\phi_i\rvert^2=\sum_j\lvert\phi_j\rvert^2$。

实验室的叠加态预设 2p(+1) + 2p(−1) 把这一点画成了一张图。它把 $m=+1$ 与 $m=-1$ 两个复基态等权相加：

$$
\frac{\psi_{21,+1}+\psi_{21,-1}}{\sqrt2}=-i\,\psi_{2p_y}
$$

这就是上一节 $p_y$ 的表达式两边除以 $i$：结果是 $2p_y$ 轨道乘上一个全局相位 $-i$。两个分量能量相同，所以这个叠加态的密度
不随时间变化；第 9 章讨论叠加态时，会把它当作「简并对照」来用。

<figure class="quviz-figure" data-lab="mode=superposition&preset=2pplus-2pminus&t=0&rep=isosurface" markdown>
**图 4.3** 叠加态预设 2p(+1) + 2p(−1) 的等密度面：$(\psi_{21,+1}+\psi_{21,-1})/\sqrt2=-i\,\psi_{2p_y}$，所以它就是沿 $y$ 轴的 $2p_y$ 两瓣——同一个简并子空间，换了一组基。两瓣的相位仍相差 $\pi$，整体多出的全局相位 $-i$ 不改变任何可观测量。曲面的形状与实基 $2p_y$ 的等密度面完全相同；但全局相位把所有颜色在色环上转了四分之一圈，所以两瓣不是红与青，而是紫色（$+y$ 一侧，相位 $-\pi/2$）与黄绿色（$-y$ 一侧，相位 $+\pi/2$）。颜色本身不是可观测量，有意义的是两瓣之间的颜色差。
</figure>

## 磁量子数的含义 {#meaning-of-m}

在复基中，$m$ 是 $L_z/\hbar$ 的本征值，有确定的物理含义 [@dlmf-spherical-harmonics, eqs. 14.30.3, 14.30.6, and 14.30.11_5]。
在实基中，QuViz 仍给每个函数标一个带符号的 $m$，但它的正负号只是一个编号：$m>0$ 对应含 $\cos(m\phi)$ 的函数，
$m<0$ 对应含 $\sin(\lvert m\rvert\phi)$ 的函数。$\lvert m\rvert>0$ 时，这个 $m$ 不是 $L_z$ 测量的确定结果；不过 $\lvert m\rvert$
仍有物理意义：这两类函数都是 $\hat L_z^2$ 的本征函数，本征值为 $m^2\hbar^2$，测量 $L_z$ 以各 $1/2$ 的概率得到
$+\lvert m\rvert\hbar$ 或 $-\lvert m\rvert\hbar$。

以 $p_x\propto\cos\phi$ 为例。作用 $\hat L_z=-i\hbar\,\partial/\partial\phi$：

$$
\hat L_z\,p_x=\hbar\,\frac{-Y_1^{-1}-Y_1^{1}}{\sqrt2}=i\hbar\,p_y
$$

结果正比于 $p_y$ 而不是 $p_x$，所以 $p_x$ 不是 $\hat L_z$ 的本征态。按复基展开，$p_x$ 中 $Y_1^{1}$ 的系数是 $-1/\sqrt2$，
$Y_1^{-1}$ 的系数是 $+1/\sqrt2$，模平方都是 $1/2$：测量 $L_z$ 会以各 $1/2$ 的概率得到 $+\hbar$ 或 $-\hbar$，平均值 $\langle L_z\rangle=0$，
而不是实基编号 $m=1$ 所暗示的确定值 $\hbar$。

## 相位颜色 {#phase-colour}

实验室用一个首尾相接的 HSV 色环表示相位 $\arg\psi$：相位 0 是红色，$\pi$ 是青色，$+\pi/2$ 是黄绿色，$-\pi/2$ 是紫色；
$-\pi$ 与 $+\pi$ 落在同一种颜色上，色环在那里连续闭合。电子云的点、等密度面的顶点和相位切片都用这同一个色环；
$\operatorname{Re}\psi$ 与 $\operatorname{Im}\psi$ 切片用从红经深色到青的发散色带，概率密度切片则用单色色带（第 7 章）。

- **实基只有两种颜色。** 实函数的相位只能是 0 或 $\pi$，所以实基的态只显示红与青；两种颜色的交界处就是节面，
  波函数在那里变号。
- **复基 $m\ne0$ 的颜色连续转动。** 绕 $z$ 轴一圈，颜色连续转过 $\lvert m\rvert$ 整圈。以复基 $2p$ 在 $xy$ 平面上的相位切片为例：
  $m=+1$ 在 $+x$ 方向是青色（相位 $\pi$，来自 Condon–Shortley 相位），$m=-1$ 在 $+x$ 方向是红色（相位 0）；
  两者在 $+y$ 方向都是紫色（相位 $-\pi/2$）。只看 $+y$ 一个方向分不出 $m$ 的正负；$+x$ 方向的颜色虽然不同，但单个方向的
  颜色取决于相位约定（去掉 Condon–Shortley 相位，两者在 $+x$ 方向都是红色），不是可观测量。可靠的判据是颜色转动的方向：从 $+z$ 向下看，
  $m=+1$ 的相位沿逆时针方向增加，$m=-1$ 的相位沿顺时针方向增加。
- **颜色不是电荷。** 红与青只说明波函数在两处的相位相差 $\pi$，也就是符号相反。

颜色的含义以右下角的图例胶囊为准。

## 常见误区 {#misconceptions}

!!! warning "误区：m = +1 就是 p_x"

    不是。复基 $m=+1$ 的态 $Y_1^{1}\propto-\sin\theta\,e^{i\phi}$ 的密度绕 $z$ 轴旋转对称，没有任何朝向 $x$ 的特征；
    $p_x$ 是 $m=+1$ 与 $m=-1$ 两个态的组合。QuViz 在实基中把 $p_x$ 编号为 $m=1$，只是一个编号约定。有一段科普视频用顺时针、
    逆时针旋转的节点来帮助记住一个 $\ell$ 有 $2\ell+1$ 个态，作者自己也称之为粗略的直觉。这个图像可以帮助记住态的数目，
    但不能读成把每个 $m$ 对应到一个轨道朝向的地图 [@floatheadphysics2025-orbitals, 27:25--30:18]。

!!! warning "误区：实轨道与复轨道描述的是不同的物理"

    它们是同一个子空间的两组基。同一个 $n,\ell$ 下，两组函数的能量都是 $E_n$，全部 $2\ell+1$ 个函数的密度之和也相同
    （Unsöld 定理）；任何复基态都能写成实基态的组合，反之亦然。选哪组基取决于想让什么有确定值、用起来是否方便：
    复基让 $L_z$ 有确定值 $m\hbar$；实基的函数取实数值、有固定的节面，但 $m\ne0$ 时对 $L_z$ 只确定了它的平方 $m^2\hbar^2$。

!!! warning "误区：红与青表示正电荷与负电荷"

    颜色表示波函数的相位。红与青相差 $\pi$，只说明波函数在两处符号相反；把整个波函数乘以 $-1$，红青互换，物理不变。
    电子的电荷密度是 $-e\lvert\psi\rvert^2$，处处为负或为零，与颜色无关。

## 思考题 {#exercises}

??? question "思考题 4.1：证明 |Y₁¹|² = |Y₁⁻¹|²"

    由 $Y_1^{\pm1}=\mp\sqrt{3/(8\pi)}\,\sin\theta\,e^{\pm i\phi}$，因子 $\mp1$ 与 $e^{\pm i\phi}$ 的模都是 1，所以

    $$
    \lvert Y_1^{1}\rvert^2=\lvert Y_1^{-1}\rvert^2=\frac{3}{8\pi}\sin^2\theta.
    $$

??? question "思考题 4.2：把 (Y₁¹ + Y₁⁻¹)/√2 写成实基函数"

    由 $p_y=i\,(Y_1^{-1}+Y_1^{1})/\sqrt2$，两边除以 $i$：

    $$
    \frac{Y_1^{1}+Y_1^{-1}}{\sqrt2}=-i\,p_y.
    $$

    它是 $p_y$ 乘以全局相位 $-i$，与 $p_y$ 是同一个物理状态。这就是图 4.3 的叠加态预设显示 $2p_y$ 的原因。

??? question "思考题 4.3：p_x 是 L_z 的本征函数吗？测量 L_z 会得到什么？"

    不是。由 $\hat L_zY_1^{\pm1}=\pm\hbar Y_1^{\pm1}$，

    $$
    \hat L_z\,p_x=\hat L_z\,\frac{Y_1^{-1}-Y_1^{1}}{\sqrt2}=\hbar\,\frac{-Y_1^{-1}-Y_1^{1}}{\sqrt2}=i\hbar\,p_y,
    $$

    不正比于 $p_x$。$p_x$ 的两个复基系数模平方都是 $1/2$，所以测得 $+\hbar$ 与 $-\hbar$ 的概率各为 $1/2$，平均值为 0。

??? question "思考题 4.4：证明 |p_x|² + |p_y|² + |p_z|² 是球对称的"

    三个角向函数分别是 $\sqrt{3/(4\pi)}$ 乘以 $x/r$、$y/r$、$z/r$，所以

    $$
    \lvert p_x\rvert^2+\lvert p_y\rvert^2+\lvert p_z\rvert^2=\frac{3}{4\pi}\,\frac{x^2+y^2+z^2}{r^2}=\frac{3}{4\pi},
    $$

    与方向无关。这正是 $\ell=1$ 的 Unsöld 定理：$(2\ell+1)/(4\pi)=3/(4\pi)$。再乘上同一个 $\lvert R_{n1}\rvert^2$，
    三个 $np$ 轨道的密度之和也是球对称的。

## 延伸阅读 {#further-reading}

- [实轨道与复轨道](../tutorials/real-vs-complex.md)：复基与实基、相位色环的实现，以及「磁量子数不是笛卡尔朝向标签」；
- [物理与数值约定](../concepts/conventions.md)：球坐标角度、Condon–Shortley 相位与实基的定义；
- [纠错账本](../references/corrections.md)：公开资料中关于 $d_{z^2}$ 节点和磁量子数的已确认问题；
- [第 2 章](02-hydrogen-levels.md)：量子数、总公式与实基记号表。

球谐函数的定义与性质见 DLMF [@dlmf-spherical-harmonics, §14.30]。
