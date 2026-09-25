# 附录 A 常见误区

这个附录把各章「常见误区」里的内容按主题集中起来，方便复习和查找。每一条先写出误区，再用一两句话给出正确的说法，
最后链接到详细讨论它的章节的「常见误区」一节。

## 局域密度与径向分布 {#density-vs-radial}

**误区**：$\lvert\psi\rvert^2$ 最大的地方，就是电子最可能出现的半径。

**正解**：$\lvert\psi\rvert^2$ 是单位体积内的概率；某个半径附近的概率要在整个薄球壳上累加，由径向分布
$P(r)=r^2\lvert R_{n\ell}(r)\rvert^2$ 给出，体积元中的 $r^2$ 让它在原子核处为零。所以 $1s$ 的 $\lvert\psi\rvert^2$
在原子核处最大，$P(r)$ 却在 $r=a_0$ 处最大。

有一段科普视频在这两种分布之间来回切换，没有稳定地标明体积元 [@floatheadphysics2025-orbitals, 06:06--10:00]。
详见[第 1 章](01-wavefunction.md#misconceptions)与[第 3 章](03-radial-nodes.md#misconceptions)。

<figure class="quviz-figure" data-lab="mode=eigenstate&n=2&l=0&m=0&basis=real&rep=slice&plane=xz&obs=probability_density" markdown>
**图 A.1** $2s$ 在 $xz$ 平面上的概率密度切片。局域密度 $\lvert\psi\rvert^2$ 在原子核处最大，在半径 $2a_0$ 的球面节点上降为零；径向分布 $P(r)=r^2\lvert R_{20}\rvert^2$ 却在 $r=(3+\sqrt5)\,a_0\approx5.24\,a_0$ 处最大。两者回答的是不同的问题（第 3 章）。
</figure>

## 节点与平均动能 {#nodes-and-kinetic-energy}

**误区**：节点越多，电子被限制得越紧，平均动能就越大；所以 $n$ 越大，平均动能越大。

**正解**：这条来自一维势阱的直觉不能搬到库仑束缚态。氢样定态满足 virial 定理 $2\langle T\rangle=-\langle V\rangle$，
于是 $\langle T\rangle=-E_n=Z^2/(2a_\mu n^2)$ Ha：$n$ 越大，节点越多，平均动能反而越小。

在实基中，节面总数是 $n-1$，这个计数本身没有错；错的是用“更局限、动能更高”来解释它。有一段科普视频借一维弦的类比
得出了相反的结论 [@floatheadphysics2025-orbitals, 05:05--06:05]；virial 定理与氢原子的能级见
[@griffiths2018qm, p. 125 (virial theorem) and ch. 4 (pp. 131--197)]。详见[第 2 章](02-hydrogen-levels.md#misconceptions)。

## 节点不一定是平面 {#nodes-are-not-planes}

**误区**：节点都是平面，所以 $d$ 轨道都是四瓣。

**正解**：节点的个数只规定零点曲面有几个，不规定它们的形状：径向节点是球面，$d_{z^2}$ 的角向因子
$3\cos^2\theta-1$ 在 $\cos\theta=\pm1/\sqrt3$ 处为零，两个角向节点是圆锥面 [@dlmf-spherical-harmonics, eq. 14.30.3]。
所以 $3d_{z^2}$ 的等值面是两瓣加一个环，而不是四瓣。

有一段科普视频把 $d$ 轨道的角向节点主要画成平面，并把 $d$ 轨道概括成四瓣 [@floatheadphysics2025-orbitals, 21:58--24:08]。
详见[第 3 章](03-radial-nodes.md#misconceptions)与[第 6 章](06-isosurface.md#misconceptions)。

## 磁量子数不是轨道朝向 {#m-is-not-a-direction}

**误区**：磁量子数 $m$ 表示轨道的朝向，例如 $m=+1$ 就是 $p_x$。

**正解**：在复基中，$m$ 给出 $L_z$ 的本征值 $m\hbar$；$m=+1$ 态的密度绕 $z$ 轴旋转对称，没有任何朝向 $x$ 的特征。
$p_x$ 与 $p_y$ 都是 $m=+1$ 与 $m=-1$ 两个态的线性组合，都不是 $\hat L_z$ 的本征态；QuViz 在实基中把 $p_x$ 编号为
$m=1$，只是一个编号约定。

有一段科普视频用顺时针、逆时针旋转的节点帮助记住一个 $\ell$ 有 $2\ell+1$ 个态。这个图像可以帮助记住态的数目，
却不能读成 $m$ 与轨道朝向的对应 [@floatheadphysics2025-orbitals, 27:25--30:18]。
详见[第 4 章](04-real-complex.md#misconceptions)。

## 电子云不是轨迹 {#cloud-is-not-a-trajectory}

**误区**：电子云里的点是电子先后经过的位置，把它们连起来就是电子的轨迹。

**正解**：每个点都是从 $\lvert\psi\rvert^2d^3r$ 独立抽取的位置样本，点的顺序没有时间含义。定态的 $\lvert\psi\rvert^2$
不随时间变化，电子云描述的是在各处找到电子的概率，而不是电子走过的路径。

详见[第 1 章](01-wavefunction.md#misconceptions)与[第 5 章](05-electron-cloud.md#misconceptions)。

## 等值面不是边界 {#isosurface-is-not-a-boundary}

**误区**：等密度面是电子的边界，电子不会跑到曲面外面。

**正解**：教材版的等密度面只包住 90 % 的概率，另外 10 % 在曲面以外；换一个包围概率，就得到另一张曲面。
波函数在曲面外并不为零，曲面只是在某个阈值上画出的一种 representation；例如 $1s$ 包住 90 % 概率的曲面是半径约
$2.66\,a_0$ 的球面，而 $1s$ 的波函数在任何有限半径上都不为零。

详见[第 6 章](06-isosurface.md#misconceptions)。

## 颜色不是电荷 {#colour-is-not-charge}

**误区**：红色和青色表示正电荷和负电荷。

**正解**：红与青表示波函数的相位 0 与 $\pi$，在 $\operatorname{Re}\psi$ 切片里就是正负号；把整个波函数乘以 $-1$，
红青互换，物理状态不变。电子的电荷密度是 $-e\lvert\psi\rvert^2$，处处为负或为零，与颜色无关；每种画法里颜色的含义
都以图例为准。

详见[第 4 章](04-real-complex.md#misconceptions)与[第 7 章](07-phase-slices.md#misconceptions)。

## 定态也可以有概率流 {#stationary-is-not-still}

**误区**：定态的电子是静止的，概率不会流动。

**正解**：「定态」只说明密度 $\rho$ 不随时间变化；连续性方程只要求 $\nabla\cdot\mathbf j=0$，并不要求 $\mathbf j=0$。
复基 $m\ne0$ 的定态有绕 $z$ 轴的稳定环流，流速 $\lvert\mathbf v\rvert=\hbar\lvert m\rvert/(\mu s)$（$s$ 是到 $z$ 轴的距离）；
实轨道的 $\mathbf j=0$ 也只说明概率没有净的输运，并不说明电子静止。

详见[第 8 章](08-probability-current.md#misconceptions)。

## 叠加态不是来回跳 {#superposition-is-not-hopping}

**误区**：叠加态就是电子在两个轨道之间来回跳。

**正解**：叠加态是一个波函数 $\Psi$。只要其中有能量不同的项，它的密度就随时间连续变化；例如 $(\psi_{1s}+\psi_{2p_z})/\sqrt2$ 的
$\langle z\rangle$ 以周期 $T=16\pi/3\approx16.755\,\hbar/E_h$ 连续地振荡，在任何时刻电子都不是「处在 $1s$」或「处在 $2p_z$」。
测量能量时得到 $E_1$ 或 $E_2$ 之一，概率各为 1/2；这是测量的结果，不说明电子在测量之前在两个态之间跳来跳去。
能量简并的叠加（例如 $2s+2p_z$）只随时间多出一个全局相位，密度不随时间变化。

详见[第 9 章](09-superposition-time.md#misconceptions)。

## 探测器图样不是密度照片 {#detector-image-is-not-density}

**误区**：实验直接拍到了氢原子的电子云，探测器图样就是 $\lvert\psi\rvert^2$ 的照片。

**正解**：光电离显微实验记录的是电子被电离、在电场中飞行之后打在二维探测器上的计数；在 Stodolna 等人的实验条件下，
它显示的是沿一个抛物坐标的节点结构怎样映射到探测器上 [@stodolna2013stark]。探测器图样既不是三维的，
也不能逐像素等同于原空间的 $\lvert\psi\rvert^2$。

详见[第 10 章](10-experiment.md#misconceptions)。

## 杂化轨道不是可观测量 {#hybrids-are-not-observables}

**误区**：杂化轨道是可以直接观测的实在，$sp^3$ 是唯一正确的成键图景。

**正解**：杂化轨道是同一个子空间里的另一组基，四个 $sp^3$ 杂化函数的密度之和与原来的 $2s$ 和三个 $2p$ 的密度之和相同
[@maksic1986hybridization]。在最简单的单行列式近似里，对占据轨道做任意幺正变换，总密度和总能量都不变，所以局域的键轨道
与离域的分子轨道可以描述同一个多电子态，哪一组轨道都不能单独被「拍」出来。

详见[第 11 章](11-symmetry-hybridization.md#misconceptions)。

这个附录只收录读图和学习中的误区。对具体资料（包括上面引用的科普视频）的逐条纠正，以及本项目自己写错过的内容，
集中记录在[纠错账本](../references/corrections.md)里。
