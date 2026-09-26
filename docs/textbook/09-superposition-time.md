# 第 9 章 叠加态与时间演化

到目前为止，本书画出的每一个态都是定态：它的密度 $\lvert\psi\rvert^2$ 永远不随时间变化。这一章把能量不同的定态叠加起来，
得到第一批真正随时间变化的密度。它们以什么频率变化，全由各项之间的能量差决定，怎样变化则取决于各项的空间形状与系数；
能量相同的叠加则根本不动，
正好用来检验画面有没有制造出并不存在的运动。

## 学习目标 {#goals}

读完本章，你应当能够：

- 写出定态叠加的含时波函数 $\Psi(\mathbf r,t)$；
- 由能量差求出拍频与振荡周期；
- 判断一个叠加态的密度会不会随时间变化；
- 在实验室里读出 Bohr 振荡与能量简并的负对照。

## 定态与时间因子 {#time-evolution}

波函数随时间的变化由含时 Schrödinger 方程决定：

$$
i\hbar\frac{\partial\Psi}{\partial t}=\hat H\Psi
$$

对能量本征态 $\hat H\psi_k=E_k\psi_k$，方程的解是 $\psi_k(\mathbf r)\,e^{-iE_kt/\hbar}$。时间只出现在一个模为 1 的相位因子里，
所以 $\lvert\psi_k\rvert^2$ 不随时间变化，这就是「定态」这个名字的来历；第 8 章还看到，这个因子也不改变概率流。

方程是线性的，所以定态的任意线性组合也是它的解：

$$
\Psi(\mathbf r,t)=\sum_kc_k\,\psi_k(\mathbf r)\,e^{-iE_kt/\hbar},\qquad\sum_k\lvert c_k\rvert^2=1
$$

系数 $c_k$ 由 $t=0$ 时的态决定，此后不再改变，每一项只按自己的能量转动相位 [@griffiths2018qm; @science-asylum2020-orbitals]。
这里各项 $\psi_k$ 是互不相同的 $\psi_{n\ell m}$，它们彼此正交归一，所以 $\sum_k\lvert c_k\rvert^2=1$ 就是全部的归一化条件，并且在任何时刻都成立。

实验室正是这样计算叠加态的：给每一项乘上它的解析相位因子，再把各项相加。其中没有数值的时间步进，所以也没有随时间累积的误差。
能量取[第 2 章](02-hydrogen-levels.md#energy-levels)的能级公式；教材版实验室取 $Z=1$、$a_\mu=1$，所以 $E_n=-1/(2n^2)$ Ha。

实验室的四个叠加态预设 $1s+2p_z$、$1s+3d_{z^2}$、$2s+2p_z$ 与 2p(+1) + 2p(−1) 都是两个本征态的等权叠加，两项的系数都是 $1/\sqrt2$。

## 干涉项与拍频 {#interference}

只有两项时，把 $\Psi=c_1\psi_1e^{-iE_1t/\hbar}+c_2\psi_2e^{-iE_2t/\hbar}$ 代入 $\lvert\Psi\rvert^2=\Psi^*\Psi$：

$$
\lvert\Psi\rvert^2=\lvert c_1\rvert^2\lvert\psi_1\rvert^2+\lvert c_2\rvert^2\lvert\psi_2\rvert^2+2\operatorname{Re}\!\left[c_1^*c_2\,\psi_1^*\psi_2\,e^{-i\omega t}\right],\qquad\omega=\frac{E_2-E_1}{\hbar}
$$

前两项与时间无关，随时间变化的只有第三项，也就是**干涉项**。它以角频率 $\omega$ 振荡，周期是 $T=2\pi/\omega$。
第 5 章讲[叠加态的采样](05-electron-cloud.md#superposition-sampling)时，被错误捷径丢掉的正是这一项。

两个能量本身并不出现在 $\lvert\Psi\rvert^2$ 里：共同的因子 $e^{-iE_1t/\hbar}$ 是全局相位，求模时消掉了，留下的只有相对相位
$(E_2-E_1)t/\hbar$。这与两个音调叠加时听到的「拍」一样，频率由两者之差决定，所以 $\omega$ 称为拍频。
当 $E_1=E_2$ 时 $\omega=0$，$\lvert\Psi\rvert^2$ 中没有任何量依赖 $t$：能量简并的叠加仍然是定态。项数更多时，每一对能量不同的项
各贡献一个频率 $(E_j-E_k)/\hbar$。氢原子的能级 $E_n=-1/(2n^2)$ Ha 只依赖 $n$ [@griffiths2018qm, ch. 4 (pp. 131--197)]，
所以 $E_2-E_1=\tfrac38$ Ha，$E_3-E_1=\tfrac49$ Ha，而 $n$ 相同的项之间没有拍频。

同样的推导也适用于可观测量的平均值。以偶极 $\langle z\rangle$ 为例：每个 $\psi_{n\ell m}$ 都有确定的宇称 $(-1)^\ell$（它们的简并组合则不一定，例如下文的 $2s+2p_z$），$\lvert\psi_k\rvert^2$ 关于原点对称，
所以 $\langle\psi_k\lvert z\rvert\psi_k\rangle=0$，只剩交叉项：

$$
\langle z\rangle(t)=2\operatorname{Re}\!\left[c_1^*c_2\,d\,e^{-i\omega t}\right],\qquad d=\langle\psi_1\lvert z\rvert\psi_2\rangle
$$

## 1s + 2p_z：Bohr 振荡 {#bohr-oscillation}

预设 $1s+2p_z$ 是 $(\psi_{1s}+\psi_{2p_z})/\sqrt2$。两项的能量差是 $\hbar\omega=E_2-E_1=\tfrac38$ Ha，所以
$T=2\pi/\omega=16\pi/3\approx16.755\,\hbar/E_h\approx0.405$ fs。$\hbar\omega\approx10.20$ eV 正是 $2p\to1s$ 跃迁发出的 Lyman α 光子的能量
（[第 2 章](02-hydrogen-levels.md#exercises)思考题 2.2）：密度振荡的频率就是这条谱线的频率。

两个系数都是实数 $1/\sqrt2$，代入上一节的公式，偶极随时间余弦振荡：

$$
\langle z\rangle(t)=\frac{2^7\sqrt2}{3^5}\,a_0\cos\omega t\approx0.745\,a_0\cos\omega t
$$

振幅 $d=\langle100\lvert z\rvert210\rangle=(2^7\sqrt2/3^5)\,a_0$ 就是教科书中的 $1s$–$2p$ 跃迁偶极矩。$t=0$ 时两项同相，
在 $\psi_{2p_z}>0$ 的 $+z$ 一侧相长、在 $-z$ 一侧相消；半个周期后相对相位转过 $\pi$，情况正好反过来。
准确地说，$z>0$ 一侧的概率是 $\tfrac12+\tfrac{4\sqrt2}{27}\cos\omega t$，在约 71 % 与约 29 % 之间往复。

密度要从 $+z$ 一侧移到 $-z$ 一侧，就必须有概率流过去，这正是[第 8 章](08-probability-current.md)的连续性方程
$\partial\rho/\partial t+\nabla\cdot\mathbf j=0$ 所要求的。$t=0$ 时 $\Psi$ 是实函数，$\mathbf j=\mathbf 0$，此刻密度恰好处在振荡的端点，瞬时不变。
对这个叠加态可以直接算出 $\mathbf j=\frac{\hbar}{2\mu}\sin\omega t\,\left(\psi_{2p_z}\nabla\psi_{1s}-\psi_{1s}\nabla\psi_{2p_z}\right)$：
流的空间形状不变，只按 $\sin\omega t$ 整体缩放，在 $t=T/4$ 与 $t=3T/4$ 时最强、方向相反。在 $z=0$ 平面上 $\psi_{2p_z}=0$，只剩
$j_z=-\frac{\hbar}{2\mu}\sin\omega t\,\psi_{1s}\,\partial_z\psi_{2p_z}$；在 $0<\omega t<\pi$ 时它处处为负，概率整片地从上半空间流向下半空间。

<figure class="quviz-figure" data-lab="mode=superposition&preset=1s-2pz&t=0&rep=slice&plane=xz&obs=probability_density" markdown>
**图 9.1** $(\psi_{1s}+\psi_{2p_z})/\sqrt2$ 在 $t=0$ 的 $xz$ 平面概率密度：两项同相，干涉项让密度偏向 $+z$，$\langle z\rangle\approx+0.745\,a_0$。约 71 % 的概率在 $z>0$ 一侧。
</figure>

<figure class="quviz-figure" data-lab="mode=superposition&preset=1s-2pz&t=8.4&rep=slice&plane=xz&obs=probability_density" markdown>
**图 9.2** 同一叠加态在 $t=8.4\,\hbar/E_h$（约半个周期）：相对相位转过约 $\pi$，密度偏向 $-z$，$\langle z\rangle\approx-0.745\,a_0$。画面几乎就是图 9.1 的上下翻转。
</figure>

<figure class="quviz-figure" data-lab="mode=superposition&preset=1s-2pz&t=4.2&rep=streamlines" markdown>
**图 9.3** 同一叠加态在 $t=4.2\,\hbar/E_h$（约四分之一周期）的概率流线：此刻 $\Psi$ 不能再取为实函数，概率正从 $+z$ 一侧流向 $-z$ 一侧；$t=0$ 时 $\Psi$ 是实函数，流恰好为零。两项都是 $m=0$，每条流线都落在一个包含 $z$ 轴的平面内，不再是第 8 章那种绕 $z$ 轴的圆。流线不带箭头，流向要从 $\langle z\rangle$ 的变化读出。
</figure>

## 1s + 3d_z²：四极“呼吸” {#quadrupole-breathing}

预设 $1s+3d_{z^2}$ 是 $(\psi_{1s}+\psi_{3d_{z^2}})/\sqrt2$。两项的能量差是 $\hbar\omega=E_3-E_1=\tfrac49$ Ha，所以
$T=9\pi/2\approx14.137\,\hbar/E_h\approx0.342$ fs。

两项的宇称都是偶的：在反演 $\mathbf r\to-\mathbf r$ 下，$\psi_{n\ell m}$ 乘以 $(-1)^\ell$，而这里 $\ell=0$ 与 $\ell=2$。
所以 $\Psi(-\mathbf r,t)=\Psi(\mathbf r,t)$，密度在任何时刻都关于原点对称，$\langle z\rangle=0$；偶极矩阵元 $\langle100\lvert z\rvert320\rangle$ 也为零。
这个叠加态有拍频，却没有偶极振荡。

变化的是干涉项。两项都是实函数，系数都是 $1/\sqrt2$，干涉项是

$$
\psi_{1s}\,\psi_{3d_{z^2}}\cos\omega t\;\propto\;R_{10}(r)\,R_{32}(r)\left(3\cos^2\theta-1\right)\cos\omega t
$$

$R_{10}$ 与 $R_{32}$ 在 $r>0$ 处都是正的，所以它的符号只由角向因子和 $\cos\omega t$ 决定，分界是 $3\cos^2\theta=1$（$\theta\approx54.7^\circ$）的两个圆锥，
也就是 $3d_{z^2}$ 的节锥。$t=0$ 时，干涉项在围着 $z$ 轴的锥内加强密度、在靠近 $xy$ 平面的锥外削弱密度，把分布沿 $z$ 轴拉长一些；
半个周期后符号反转，锥内减弱、锥外增强，分布沿 $z$ 轴收缩、在 $xy$ 平面附近鼓起。这种一伸一缩就是四极「呼吸」。

呼吸的幅度并不大。$3d_{z^2}$ 自身的两瓣始终让整体分布沿 $z$ 轴拉长，四极矩只在一个正值上下起伏：

$$
\langle3z^2-r^2\rangle=\bigl(36+\tfrac{243}{64\sqrt6}\cos\omega t\bigr)\,a_0^2\approx(36+1.55\cos\omega t)\,a_0^2
$$

变化集中在离核约 1–5 $a_0$ 的一圈，也就是 $1s$ 与 $3d_{z^2}$ 两项都不小的地方；更靠近核处由 $1s$ 主导，更远处由 $3d_{z^2}$ 的两瓣主导，
几乎不随时间变化。局部的相对变化可以很大，例如 $z$ 轴上离核 $3.5\,a_0$ 处，$t=7$ 时的密度只有 $t=0$ 时的约 1.5 %；
但离核 $2a_0$ 以外的密度本来就不到核处的 3 %。在按 $\sqrt{\rho/\rho_{\max}}$ 着色的切片上（第 7 章），这些地方本来就偏暗，
亮度的变化最多约为色带长度的 7 %。所以看图 9.4 时，最好用时间胶囊退回 $t=0$ 帧对比着看。

<figure class="quviz-figure" data-lab="mode=superposition&preset=1s-3dz2&t=7&rep=slice&plane=xz&obs=probability_density" markdown>
**图 9.4** $(\psi_{1s}+\psi_{3d_{z^2}})/\sqrt2$ 在 $t=7\,\hbar/E_h$（约半个周期）的 $xz$ 平面概率密度：与 $t=0$ 相比，沿 $z$ 轴的密度减弱、$xy$ 平面附近增强；密度始终关于 $z=0$ 对称，$\langle z\rangle=0$。变化集中在离核约 1–5 $a_0$ 的范围，幅度不大，可以退回 $t=0$ 帧对比。
</figure>

## 能量简并的负对照 {#degenerate-controls}

预设 $2s+2p_z$ 是 $(\psi_{2s}+\psi_{2p_z})/\sqrt2$。两项的 $n$ 相同，$E_{2s}=E_{2p}=E_2$，所以
$\Psi(\mathbf r,t)=e^{-iE_2t/\hbar}\,\Psi(\mathbf r,0)$：整个波函数只多出一个全局相位。密度 $\lvert\Psi\rvert^2$ 在任何时刻都与 $t=0$ 时相同；
概率流也处处为零，因为 $\Psi(\mathbf r,0)$ 是实函数，乘上全局相位后仍然没有流（第 8 章）。

这个密度并不对称。$2s$ 在 $r=2a_0$ 处有[径向节点](03-radial-nodes.md#radial-nodes)，节点以外 $\psi_{2s}<0$，与 $\psi_{2p_z}$ 在 $z<0$ 一侧的负瓣相长；
节点以内虽然偏向 $+z$，却只占 5.27 % 的概率。结果是 7/8 的概率在 $z<0$ 一侧，偶极 $\langle z\rangle=\langle200\lvert z\rvert210\rangle=-3a_0$，
在任何时刻都是这个值。一个偏向一侧、却一动不动的密度说明，「偏」与「动」是两回事：运动只来自能量差。

全局相位也并非看不见。$\Psi(\mathbf r,0)$ 是实函数，所以 $\operatorname{Re}\Psi=\cos(E_2t/\hbar)\,\Psi(\mathbf r,0)$，
$\operatorname{Im}\Psi=-\sin(E_2t/\hbar)\,\Psi(\mathbf r,0)$。如果在不同时刻画实部、虚部或相位切片，它们会随全局相位转动，
正如[第 7 章](07-phase-slices.md#global-phase)所说；密度却始终不动。任何让这个密度动起来的画面都是程序错误（bug），
所以实验室不播放简并预设（见下一节）。

另一个简并预设 2p(+1) + 2p(−1) 在[第 4 章](04-real-complex.md#basis-change)出现过：$(\psi_{21,+1}+\psi_{21,-1})/\sqrt2=-i\,\psi_{2p_y}$。
两项同属 $n=2$，所以它同样只随时间多出全局相位，密度就是静止的 $2p_y$ 两瓣。两个分量单独看都绕 $z$ 轴环流、方向相反（第 8 章），
叠加后却是一个实函数乘常数相位，概率流处处为零。

<figure class="quviz-figure" data-lab="mode=superposition&preset=2s-2pz&t=0&rep=slice&plane=xz&obs=probability_density" markdown>
**图 9.5** 简并叠加态 $(\psi_{2s}+\psi_{2p_z})/\sqrt2$ 的概率密度：明显偏向 $-z$（$\langle z\rangle=-3a_0$），但两项能量相同，这张图在任何时刻都不变。7/8 的概率在 $z<0$ 一侧。
</figure>

## 实验室里的时间 {#playback}

实验室的时间以原子单位 $\hbar/E_h\approx24.19$ as 计（1 as $=10^{-18}$ s），所以周期 16.755 与 14.137 分别约为 405 as 与 342 as。

播放振荡的预设时，实验室把一个周期 $T$ 等分成 $N=\lceil T/0.6\rceil$ 帧：第 $k$ 帧的理想时刻是 $kT/N$，再取到最近的
$0.2\,\hbar/E_h$ 格点上。

- $1s+2p_z$：$N=28$，帧时刻正好是 $0,0.6,1.2,\dots,16.2$；
- $1s+3d_{z^2}$：$N=24$，间隔大多是 0.6，只有从 5.4 到 5.8 的一步是 0.4，最后一帧是 13.6。

最后一帧之后回到 $t=0$。每一帧的时刻都由帧号单独算出，取整误差不会逐帧累积，每一圈都重复完全相同的帧。
帧时刻只是周期的近似等分：图 9.3 的 $t=4.2$ 是 $0.251\,T$，图 9.2 的 $t=8.4$ 是 $0.501\,T$，图 9.4 的 $t=7$ 是 $0.495\,T$，
所以图注里都写「约」。

教材版实验室正好预先计算了这些帧上的等密度面、概率流线和 $xz$ 平面切片；叠加态的电子云尚未实现（第 5 章）。时间胶囊按帧步进和播放。
两个简并预设只有 $t=0$ 一帧，时间胶囊显示「能量简并：密度不随时间变化」。

## 常见误区 {#misconceptions}

!!! warning "误区：叠加态是电子在两个轨道之间来回跳"

    叠加态是一个波函数 $\Psi$；像 $1s+2p_z$ 这样能量不同的两项叠加，密度随时间连续变化（图 9.1、图 9.2）；
    在任何时刻，电子都不是「处在 $1s$」或「处在 $2p_z$」。
    测量能量时，结果是 $E_1$ 或 $E_2$ 之一，概率分别是 $\lvert c_1\rvert^2$ 与 $\lvert c_2\rvert^2$（这里都是 1/2）；
    这是测量的结果，不说明电子在测量之前在两个态之间跳来跳去。

!!! warning "误区：任何叠加态都会随时间变化"

    密度的变化只来自能量不同的项之间的干涉。能量简并的叠加，例如 $2s+2p_z$ 与 2p(+1) + 2p(−1)，只随时间多出一个全局相位，
    是真正的定态（图 9.5）；即使密度明显偏向一侧，它也不会动。

!!! warning "误区：切片的颜色在转，说明态在变化"

    全局相位 $e^{i\alpha}$ 会改变实部、虚部切片，并让相位切片的颜色沿色环整体转动，却不改变任何可观测量：密度、概率流和各种平均值都不变。
    判断一个态是否在变化，要看 $\lvert\Psi\rvert^2$ 这样与全局相位无关的量；$\langle z\rangle$ 在变说明态在变，
    但 $\langle z\rangle$ 不变并不说明态不变：$1s+3d_{z^2}$ 的 $\langle z\rangle$ 恒为零，密度却在「呼吸」。

!!! warning "误区：实验室里的时间演化是数值积分出来的"

    实验室直接用解析的相位因子 $e^{-iE_kt/\hbar}$ 计算每一时刻的 $\Psi$，没有时间步进，也就没有随时间累积的误差。
    $0.2\,\hbar/E_h$ 的时间格点只决定画出哪些时刻，不影响每一帧的精度。

## 思考题 {#exercises}

??? question "思考题 9.1：1s + 2p_z 的振荡周期是多少飞秒？"

    $\hbar\omega=E_2-E_1=\tfrac38$ Ha，所以 $T=2\pi/\omega=16\pi/3\approx16.755\,\hbar/E_h$。由于 $\hbar/E_h\approx24.19$ as，
    $T\approx405$ as $\approx0.405$ fs。

??? question "思考题 9.2：2s + 2p_z 的密度明显偏向 −z，为什么却不动？"

    两项能量相同，相对相位 $(E_{2p}-E_{2s})t/\hbar$ 恒为零，所以 $\lvert\Psi\rvert^2$ 与 $t$ 无关。$\langle z\rangle=-3a_0$ 是一个静态的偶极：
    偏向一侧只说明两项在空间中怎样干涉，不说明它在运动。第 10 章讨论实验时还会再遇到这个态。

??? question "思考题 9.3：为什么 1s + 3d_z² 的 ⟨z⟩ 恒为零？"

    两项的宇称都是偶的（$\ell=0$ 与 $\ell=2$，宇称 $(-1)^\ell=+1$），所以 $\Psi(-\mathbf r,t)=\Psi(\mathbf r,t)$，密度关于原点对称，
    而 $z$ 是奇函数，$\langle z\rangle=0$。随时间变化的是四极形状：$\langle3z^2-r^2\rangle$ 以周期 $T\approx14.137\,\hbar/E_h$ 起伏。

??? question "思考题 9.4：为什么实验室里 1s + 2p_z 一个周期正好 28 帧？"

    $\lceil16.755/0.6\rceil=\lceil27.93\rceil=28$。第 $k$ 帧的理想时刻 $kT/28\approx0.598k$ 与 $0.6k$ 相差不到 0.05，取到最近的 0.2 格点上
    正好是 $0.6k$，所以帧时刻是 $0,0.6,\dots,16.2$，之后播放回到 0。

??? question "思考题 9.5：把叠加改为 (1s + i·2p_z)/√2，t = 0 时 ⟨z⟩ 是多少？"

    代入 $\langle z\rangle(t)=2\operatorname{Re}[c_1^*c_2\,d\,e^{-i\omega t}]$，其中 $c_1=1/\sqrt2$，$c_2=i/\sqrt2$，$d\approx0.745\,a_0$：

    $$
    \langle z\rangle(t)=\operatorname{Re}\!\left[i\,d\,e^{-i\omega t}\right]=d\sin\omega t
    $$

    $t=0$ 时 $\langle z\rangle=0$。振荡的振幅与周期都不变，只是整体推迟了四分之一周期：$\langle z\rangle$ 在 $t=T/4$ 时才达到最大值 $+d$。

## 延伸阅读 {#further-reading}

- [概率流](../concepts/probability-current.md)：一般的含时叠加为什么不再有圆形流线，以及数值实现中的连续性检查；
- [开发路线图](../project/roadmap.md)：解析叠加态的三个独立检验——Bohr 振荡的偶极、简并负对照与连续性残差；
- [第 7 章](07-phase-slices.md)：全局相位怎样改变实部、虚部与相位切片；
- [第 8 章](08-probability-current.md)：概率流与连续性方程。

概率流的定义与连续性方程，见 Griffiths 书中关于概率流的习题 [@griffiths2018qm, problem 4.49, eqs. (4.220)--(4.221), pp. 187--188]。
