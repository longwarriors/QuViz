# 第 2 章 氢原子：量子数与能级

第 1 章写出了类氢原子的定态薛定谔方程。这一章求它的束缚态：分离变量之后出现三个量子数 $n,\ell,m$，
能量只依赖其中的 $n$；再把归一化波函数的总公式逐个因子读一遍。后面各章画出的本征态都建立在这条公式上：复基的态和 $m=0$ 的态
直接由它算出；实基中 $m\ne0$ 的态保留同一个径向部分，只把其中的复球谐函数 $Y_\ell^m$ 换成由 $Y_\ell^{\lvert m\rvert}$ 与
$Y_\ell^{-\lvert m\rvert}$ 组合成的实球谐函数（第 4 章）。

## 学习目标 {#goals}

读完本章，你应当能够：

- 写出类氢波函数的分离形式，以及三个量子数 $n,\ell,m$ 的取值范围；
- 计算能级 $E_n$，并解释（不计自旋时）第 $n$ 能级为什么是 $n^2$ 重简并的；
- 用 $a_\mu$ 和 $Z$ 换算长度与能量的尺度；
- 读懂归一化波函数总公式中的每一个因子。

## 分离变量 {#separation}

库仑势 $-Z/r$ 只依赖电子到原子核的距离，是一个中心势。中心势问题在球坐标中可以分离变量，
束缚态写成径向函数与角向函数的乘积：

$$
\psi_{n\ell m}(r,\theta,\phi)=R_{n\ell}(r)\,Y_\ell^m(\theta,\phi)
$$

球坐标的约定是：$\theta\in[0,\pi]$ 是从 $+z$ 轴量起的极角，$\phi\in[0,2\pi)$ 是 $xy$ 平面内从 $+x$ 轴量起的方位角，
$x=r\sin\theta\cos\phi$，$y=r\sin\theta\sin\phi$，$z=r\cos\theta$。

角向部分 $Y_\ell^m$ 是球谐函数，它对任何中心势都一样；库仑势的全部信息都在径向部分 $R_{n\ell}$ 里
[@griffiths2018qm, ch. 4 (pp. 131--197)]。

## 量子数 {#quantum-numbers}

分离变量时出现的三个方程各自带来一个整数：

$$
n=1,2,3,\dots,\qquad \ell=0,1,\dots,n-1,\qquad m=-\ell,\dots,+\ell
$$

- 方位角方程要求 $e^{im\phi}$ 在 $\phi\to\phi+2\pi$ 时回到原值，所以 $m$ 是整数；
- 极角方程要求解在 $\theta=0$ 和 $\theta=\pi$ 处有限，这给出非负整数 $\ell$，且 $\ell\ge\lvert m\rvert$；
- 径向方程要求解在无穷远处衰减、可以归一化，这给出主量子数 $n$ 和限制 $\ell\le n-1$。

$\ell$ 标记角动量平方 $\hat L^2$ 的本征值 $\ell(\ell+1)\hbar^2$。在复基中，$m$ 标记 $\hat L_z$ 的本征值 $m\hbar$；
第 4 章会说明，实基中 $m\ne0$ 的态为什么不再是 $\hat L_z$ 的本征态。

固定 $n$ 时，每个 $\ell$ 贡献 $2\ell+1$ 个 $m$，所以不计自旋时，态的总数是

$$
\sum_{\ell=0}^{n-1}(2\ell+1)=n^2
$$

| $n$ | 允许的 $\ell$ | 态的个数 |
|---|---|---|
| 1 | 0 | 1 |
| 2 | 0, 1 | 1 + 3 = 4 |
| 3 | 0, 1, 2 | 1 + 3 + 5 = 9 |

下一节会说明，同一个 $n$ 下的这些态能量完全相同，形状却可以很不一样。下面两张图都是 $n=2$ 的态在 $xz$ 平面上的概率密度切片：
一个是 $\ell=0$ 的 $2s$，一个是 $\ell=1$ 的 $2p_z$。

<figure class="quviz-figure" data-lab="mode=eigenstate&n=2&l=0&m=0&basis=real&rep=slice&plane=xz&obs=probability_density" markdown>
**图 2.1** $2s$（$n=2,\ell=0$）在 $xz$ 平面上的概率密度：中心明亮，外面隔着一圈暗环；暗环是半径 $2a_0$ 处的径向节点。
</figure>

<figure class="quviz-figure" data-lab="mode=eigenstate&n=2&l=1&m=0&basis=real&rep=slice&plane=xz&obs=probability_density" markdown>
**图 2.2** $2p_z$（$n=2,\ell=1,m=0$）在 $xz$ 平面上的概率密度：两瓣沿 $z$ 轴分布，$z=0$ 平面是节面。它与图 2.1 的能量完全相同。
</figure>

## 能级 {#energy-levels}

径向方程的束缚解只在能量取下列值时存在：

$$
E_n=-\frac{Z^2}{2a_\mu n^2}\ \text{Ha}
$$

能量为负，表示电子被束缚；$n\to\infty$ 时 $E_n\to0$，对应电离阈值 [@griffiths2018qm, ch. 4 (pp. 131--197)]。
取 $Z=1$、$a_\mu=1$，并用 1 Ha = 27.2114 eV 换算：

| $n$ | $E_n$ (Ha) | $E_n$ (eV) |
|---|---|---|
| 1 | $-0.5$ | $-13.606$ |
| 2 | $-0.125$ | $-3.401$ |
| 3 | $-0.05556$ | $-1.512$ |
| 4 | $-0.03125$ | $-0.850$ |

能量只依赖 $n$，与 $\ell$、$m$ 都无关。$m$ 不影响能量，对任何中心势都成立；$\ell$ 也不影响能量，却不是一般中心势都有的性质，
而是 $1/r$ 库仑势的特殊之处。所以在本书的模型里，$2s$ 与三个 $2p$ 的能量完全相同，这就是 $n^2$ 重简并。能级也越来越密：
$E_1$ 到 $E_2$ 相差 $0.375$ Ha，$E_3$ 到 $E_4$ 只差约 $0.0243$ Ha。

实验室详情面板的「图表」标签页会为当前选中的态画出这条能级梯。

## 约化质量与尺度 {#reduced-mass}

第 1 章引入了 $a_\mu=m_e/\mu$，其中 $\mu$ 是电子与原子核的约化质量。改变 $Z$ 和 $a_\mu$ 只会整体缩放长度与能量：

- 长度按 $a_\mu/Z$ 缩放：$Z$ 越大，电子被拉得越近；
- 能量按 $Z^2/a_\mu$ 缩放：$E_n$ 中的这两个因子正是由此而来。

对氢原子，质子质量约为电子的 1836.15 倍，所以 $\mu/m_e\approx0.999456$，$a_\mu\approx1.000545$，
基态能量是 $E_1\approx-13.598$ eV，比原子核无穷重时的 $-13.606$ eV 略高。差别只在万分之几，
但光谱测量完全分辨得出来（思考题 2.2）。

教材版实验室取 $a_\mu=1$，也就是原子核无穷重的极限；长度单位是 bohr（$a_0$），能量单位是 hartree（Ha）。

## 总公式 {#general-formula}

把径向解与球谐函数乘在一起，并要求 $\int\lvert\psi\rvert^2d^3r=1$，得到类氢波函数的总公式，即把 Griffiths
氢原子波函数中的 Bohr 半径 $a$ 换成 $a_\mu/Z$ 的结果 [@griffiths2018qm, eq. (4.89), p. 151]：

$$
\boxed{
\psi_{n\ell m}(r,\theta,\phi)
=
\left(\frac{2Z}{na_\mu}\right)^{3/2}
\sqrt{\frac{(n-\ell-1)!}{2n(n+\ell)!}}
\,e^{-\rho/2}\rho^\ell
L_{n-\ell-1}^{2\ell+1}(\rho)
\,Y_\ell^m(\theta,\phi)
}
$$

其中 $\sigma=Zr/a_\mu$，$\rho=2\sigma/n=2Zr/(na_\mu)$。逐个因子来读：

- **归一化常数** $\left(\frac{2Z}{na_\mu}\right)^{3/2}\sqrt{\frac{(n-\ell-1)!}{2n(n+\ell)!}}$：球谐函数已经在球面上归一化，
  这个常数保证 $\int_0^\infty\lvert R_{n\ell}\rvert^2r^2\,dr=1$。式中 $r$ 以 $a_0$ 计、$a_\mu=m_e/\mu$ 是无量纲的质量比，
  所以这个常数的单位是 $a_0^{-3/2}$（写回国际单位制时，$a_\mu$ 要换成约化 Bohr 半径 $a_\mu a_0$），$\psi$ 因此带上
  长度的 $-3/2$ 次方量纲，$\lvert\psi\rvert^2$ 是“每单位体积”的量，与第 1 章的概率密度一致；
- **指数衰减** $e^{-\rho/2}=e^{-Zr/(na_\mu)}$：远离原子核时波函数指数衰减，衰减长度 $na_\mu/Z$ 随 $n$ 增大，
  所以激发态比基态更弥散；
- **幂次** $\rho^\ell$：原子核附近 $R_{n\ell}\propto r^\ell$，$\ell\ge1$ 的态在原子核处为零（第 3 章）；
- **广义 Laguerre 多项式** $L_{n-\ell-1}^{2\ell+1}(\rho)$：次数为 $n-\ell-1$，在 $\rho>0$ 上恰有这么多个根，
  它们就是径向节点（第 3 章）；
- **球谐函数** $Y_\ell^m(\theta,\phi)$：携带全部角度依赖，采用含 Condon–Shortley 相位的标准约定。

多项式与球谐函数的约定分别对照 DLMF 18.5.12 与 14.30.1
[@dlmf-laguerre, eq. 18.5.12; @dlmf-spherical-harmonics, eq. 14.30.1]。有些较早的文献对 Laguerre 多项式
采用另一套记号和归一化，把别处的公式代入这里之前要先核对约定。

作为检验，取 $n=1$、$\ell=m=0$：$L_0^1=1$，$Y_0^0=1/\sqrt{4\pi}$，归一化常数是 $2(Z/a_\mu)^{3/2}$，于是
$\psi_{100}=\frac{1}{\sqrt\pi}\left(\frac{Z}{a_\mu}\right)^{3/2}e^{-Zr/a_\mu}$，正是第 1 章验证过归一化的基态。

QuViz 直接按这条公式计算复基的每一个本征态。实基中 $m\ne0$ 的态不能直接代入这条公式：QuViz 保留同一个径向因子和归一化常数，
只把 $Y_\ell^m$ 换成实球谐函数

$$
Y_{\ell m}^{\mathrm{real}}=\sqrt2(-1)^m\operatorname{Re}Y_\ell^m\quad(m>0),\qquad
Y_{\ell m}^{\mathrm{real}}=\sqrt2(-1)^m\operatorname{Im}Y_\ell^{\lvert m\rvert}\quad(m<0),
$$

它在球面上同样归一化；$m=0$ 时 $Y_\ell^0$ 本来就是实函数，两个基给出同一个态。实球谐函数的定义见
[物理与数值约定](../concepts/conventions.md)，第 4 章讨论它与复基的关系。广义 Laguerre 多项式和球谐函数都由 SciPy 求值
[@scipy-eval-genlaguerre; @scipy-sph-harm-y]，不手工展开任何高阶多项式。

## 轨道记号 {#orbital-labels}

$\ell=0,1,2,3$ 分别记作 $s,p,d,f$，前面写上 $n$：$\ell=1$、$n=3$ 就是 $3p$。$\ell=1,2$ 的实基角向函数
$Y_{\ell m}^{\mathrm{real}}$ 各正比于一个简单的笛卡儿表达式，QuViz 据此给它们起名：

| $\ell$ | $m$ | 实基记号 | 角向部分正比于 |
|---|---|---|---|
| 1 | 1 | $p_x$ | $x/r$ |
| 1 | $-1$ | $p_y$ | $y/r$ |
| 1 | 0 | $p_z$ | $z/r$ |
| 2 | $-2$ | $d_{xy}$ | $xy/r^2$ |
| 2 | $-1$ | $d_{yz}$ | $yz/r^2$ |
| 2 | 0 | $d_{z^2}$ | $(3z^2-r^2)/r^2$ |
| 2 | 1 | $d_{xz}$ | $xz/r^2$ |
| 2 | 2 | $d_{x^2-y^2}$ | $(x^2-y^2)/r^2$ |

$f$ 态（$\ell=3$）不用笛卡儿昵称，直接写成「4f, m=…」的形式。

表中的 $m$ 是实球谐函数 $Y_{\ell m}^{\mathrm{real}}$ 的编号，不是总公式里复球谐 $Y_\ell^m$ 的 $m$：把 $(\ell,m)=(2,-2)$ 代入 $Y_\ell^m$，得到的
$Y_2^{-2}\propto(x-iy)^2/r^2$ 是复函数，并不是 $d_{xy}$。表中 $m$ 与记号的对应只是 QuViz 对实基的编号约定。
$m$ 并不是轨道朝向的标签，第 4 章会解释原因。

## 常见误区 {#misconceptions}

!!! warning "误区：氢原子里 2s 比 2p 能量低"

    在本书忽略自旋和相对论修正的模型里，氢原子的能量只依赖 $n$，$2s$ 与 $2p$ 完全简并
    [@griffiths2018qm, ch. 4 (pp. 131--197)]。“$2s$ 低于 $2p$”说的是多电子原子：其他电子屏蔽了原子核的电荷，
    而不同 $\ell$ 的电子受屏蔽的程度不同。精细结构等更小的修正不在本书的模型之内。

!!! warning "误区：n 越大，电子的平均动能越大"

    一维势阱里“节点越多、动能越大”的直觉不能搬到库仑束缚态。氢样定态满足 virial 定理
    $2\langle T\rangle=-\langle V\rangle$，于是 $E_n=\langle T\rangle+\langle V\rangle=-\langle T\rangle$，
    即 $\langle T\rangle=-E_n=Z^2/(2a_\mu n^2)$。$n$ 增大时总能量变得不那么负，平均动能反而减小
    [@griffiths2018qm, problem 3.37, p. 125, and problem 4.48, eq. (4.218), p. 187]。

!!! warning "误区：m 表示轨道的朝向"

    $2p_z$ 恰好沿 $z$ 轴，而它的 $m=0$，这很容易让人以为 $m$ 就是朝向的编号。但在复基中，$m$ 描述的是绕 $z$ 轴的角动量
    $L_z=m\hbar$，不是方向；实基的 $p_x$ 与 $p_y$ 则都不是 $\hat L_z$ 的本征态。第 4 章专门讨论这一点。

## 思考题 {#exercises}

??? question "思考题 2.1：n = 3 一共有多少个 (ℓ, m) 组合？"

    $\ell=0,1,2$ 分别有 $1,3,5$ 个 $m$，共 $1+3+5=9=n^2$ 个：一个 $3s$、三个 $3p$、五个 $3d$。
    这里没有计入自旋。

??? question "思考题 2.2：氢原子从 n = 2 跃迁到 n = 1，发出的光子能量和波长是多少？"

    取 $a_\mu=1$，$\Delta E=E_2-E_1=-\tfrac18+\tfrac12=\tfrac38$ Ha $\approx10.20$ eV。用 $hc\approx1239.84$ eV·nm，

    $$
    \lambda=\frac{hc}{\Delta E}\approx\frac{1239.84\ \text{eV·nm}}{10.204\ \text{eV}}\approx121.5\ \text{nm},
    $$

    这是紫外区的 Lyman α 线。计入约化质量后 $\Delta E$ 乘以 $\mu/m_e\approx0.999456$，波长变为约 121.57 nm。

??? question "思考题 2.3：He⁺（Z = 2）基态的能量和 1s 平均半径是多少？"

    取 $a_\mu=1$，$E_1=-Z^2/2=-2$ Ha $\approx-54.4$ eV，是氢原子的 4 倍。

    氢原子 $1s$ 的平均半径是 $\langle r\rangle=\int_0^\infty r\cdot4r^2e^{-2r}\,dr=4\cdot\frac{3!}{2^4}=1.5\,a_0$。
    长度按 $a_\mu/Z$ 缩放，所以 He⁺ 的 $\langle r\rangle_{1s}=3a_0/(2Z)=0.75\,a_0$，是氢原子的一半。

??? question "思考题 2.4：(n, ℓ, m) = (2, 2, 0) 与 (3, 1, −2) 是允许的量子数组合吗？"

    都不允许。第一个违反 $\ell\le n-1$（$n=2$ 时 $\ell$ 最大为 1）；第二个违反 $\lvert m\rvert\le\ell$（$\ell=1$ 时
    $\lvert m\rvert$ 最大为 1）。

## 延伸阅读 {#further-reading}

- [氢与类氢轨道](../tutorials/hydrogenic-orbitals.md)：总公式、节点计数，以及一份公开动画源码中已确认的径向多项式错误；
- [物理与数值约定](../concepts/conventions.md)：球坐标角度、原子单位、$a_\mu$ 与实球谐函数的定义；
- [第 1 章](01-wavefunction.md)：薛定谔方程、Born 规则与归一化。

氢原子的完整求解见 Griffiths 与 Schroeter 教材第 4 章，广义 Laguerre 多项式的定义见 DLMF
[@griffiths2018qm, ch. 4 (pp. 131--197); @dlmf-laguerre, eq. 18.5.12]。
