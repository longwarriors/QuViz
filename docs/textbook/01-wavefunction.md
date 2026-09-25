# 第 1 章 波函数与 Born 规则

在本书忽略自旋的非相对论模型里，电子的状态由它的波函数完整描述，但波函数本身并不是能直接看到或测到的量。
这一章从氢原子的薛定谔方程出发，说明波函数怎样通过 Born 规则给出概率，再用基态 $1s$ 把归一化、体积元和全局相位逐一算一遍。
后面每一章的图都建立在这几条规则之上。

## 学习目标 {#goals}

读完本章，你应当能够：

- 写出类氢原子的定态薛定谔方程，并说明 $\psi$ 取复数值；
- 用 Born 规则把 $\lvert\psi\rvert^2\,d^3r$ 解释为位置测量的概率；
- 在球坐标中完成归一化积分，并解释因子 $r^2\sin\theta$ 从何而来；
- 区分不可观测的全局相位与第 7、9 章要用到的相对相位。

## 波函数 {#wavefunction}

波函数 $\psi(\mathbf r,t)\in\mathbb C$ 是**概率幅**，不是概率。它在空间每一点给出一个复数，可以写成实部加虚部，
也可以写成模与相位：

$$
\psi=\operatorname{Re}\psi+i\operatorname{Im}\psi=\lvert\psi\rvert\,e^{i\arg\psi}.
$$

实部、虚部、模和相位都是从 $\psi$ 派生出来的场；实验室的平面切片可以分别画出实部、虚部、相位和概率密度
$\lvert\psi\rvert^2$。但要记住：严格按量子力学的
术语，波函数本身并不是由 Hermitian 算符表示的 observable，它是对状态的描述；能与测量直接联系的，是由它算出的
概率和期望值。下表列出三个最常被混淆的对象：

| 对象 | 数学定义 | 禁止的解释 |
|---|---|---|
| 波函数 | $\psi(\mathbf r,t)\in\mathbb C$ | 当作“概率本身” |
| 概率密度 | $\rho=\lvert\psi\rvert^2$ | 忽略体积元 |
| 相位 | $\arg\psi$ | 用线性色条表示 |

相位是周期量，$\arg\psi$ 与 $\arg\psi+2\pi$ 描述同一个复数，所以相位只能用首尾相接的色环表示，不能用两端
不相连的线性色条。

## 薛定谔方程 {#schrodinger-equation}

类氢原子由一个电子和电荷为 $Ze$ 的原子核组成。用国际单位制写出它的定态薛定谔方程：

$$
-\frac{\hbar^2}{2\mu}\nabla^2\psi(\mathbf r)-\frac{Ze^2}{4\pi\varepsilon_0 r}\psi(\mathbf r)=E\,\psi(\mathbf r)
$$

其中 $r$ 是电子到原子核的距离，$\mu=m_em_N/(m_e+m_N)$ 是电子与原子核的约化质量。Griffiths 教材第 4 章的氢原子解
用的是普通 Bohr 半径，相当于取 $\mu=m_e$、原子核无穷重 [@griffiths2018qm, ch. 4 (pp. 131--197)]；把 $m_e$ 换成 $\mu$
就计入了原子核的运动。

在原子单位制中取 $\hbar=e=m_e=4\pi\varepsilon_0=1$，长度以 Bohr 半径 $a_0$ 为单位，能量以 hartree（Ha）
为单位，并记 $a_\mu=m_e/\mu$，方程化为

$$
-\frac{a_\mu}{2}\nabla^2\psi-\frac{Z}{r}\psi=E\,\psi
$$

动能项的系数是 $a_\mu/2$ 而不是 $1/2$：只有原子核质量无穷大、$\mu=m_e$ 时，$a_\mu=1$，系数才化为 $1/2$。
教材版实验室固定 $Z=1$、$a_\mu=1$，也就是原子核无穷重的氢原子。

这个方程里的算符只含实系数，能量 $E$ 也是实数，所以一个解的实部和虚部各自也是解，定态解总可以选成实函数
（第 4 章的实基轨道就是这样选的）。但同一能级内的一般解是复系数的线性组合，第 4 章的复基轨道就带有因子 $e^{im\phi}$；
而任何定态随时间的演化都是 $\psi(\mathbf r)\,e^{-iEt/\hbar}$，这个时间因子本身就是复数。所以一开始就要把 $\psi$ 当作复值函数。

## Born 规则 {#born-rule}

Born 规则把波函数与测量联系起来：在点 $\mathbf r$ 附近的体积元 $d^3r$ 内找到电子的概率是

$$
dP=\lvert\psi(\mathbf r)\rvert^2\,d^3r
$$

因此 $\rho=\lvert\psi\rvert^2$ 是**概率密度**，即单位体积内的概率；在区域 $V$ 内找到电子的概率是
$\int_V\lvert\psi\rvert^2d^3r$ [@griffiths2018qm, eq. (1.3), p. 4]。

这里的“找到”指位置测量：对大量处于同一状态的原子各测一次电子的位置，结果落在 $V$ 内的比例趋于这个积分。
实验室的电子云模拟的正是这种重复测量：每个点都是计算机按 $\lvert\psi\rvert^2d^3r$ 独立抽取的一个位置样本
（数值上近似独立同分布），不是实测数据。点与点之间
没有先后顺序，也没有时间含义，把它们连起来不会得到电子的轨迹。

<figure class="quviz-figure" data-lab="mode=eigenstate&n=1&l=0&m=0&basis=real&rep=point_cloud" markdown>
**图 1.1** 氢原子基态 $1s$ 的电子云。每个点相当于对一个同样制备的原子做一次位置测量，所有点都独立地从 $\lvert\psi\rvert^2\,d^3r$ 抽取，点的先后顺序没有时间含义；原子核附近的点最拥挤，说明那里的局域概率密度最大。
</figure>

## 归一化 {#normalization}

电子总在空间的某处，所以全空间的概率之和必须为 1：

$$
\int\lvert\psi\rvert^2\,d^3r=1
$$

满足这一条件的波函数称为已归一化的。以类氢原子的基态 $1s$ 为例：

$$
\psi_{100}(r)=\frac{1}{\sqrt\pi}\left(\frac{Z}{a_\mu}\right)^{3/2}e^{-Zr/a_\mu}
$$

它只依赖 $r$。下一节会说明，球坐标的体积元是 $r^2\sin\theta\,dr\,d\theta\,d\phi$，对两个角度积分得到
$4\pi r^2\,dr$。取 $Z=a_\mu=1$（长度以 $a_0$ 计），再利用 $\int_0^\infty r^ke^{-\beta r}dr=k!/\beta^{k+1}$：

$$
\int_0^\infty 4\pi r^2\,\frac1\pi e^{-2r}\,dr=4\cdot\frac{2!}{2^3}=1
$$

归一化常数 $1/\sqrt\pi$ 正是为了让这个积分等于 1 而选的。

## 体积元 {#volume-element}

在球坐标 $(r,\theta,\phi)$ 中，体积元是

$$
d^3r=r^2\sin\theta\,dr\,d\theta\,d\phi
$$

沿 $r$、$\theta$、$\phi$ 各走一小步，扫出的小块三条边长分别是 $dr$、$r\,d\theta$ 和 $r\sin\theta\,d\phi$，
三者相乘就得到这个体积 [@griffiths2018qm, chs. 1 and 4 (pp. 3--24, 131--197)]。于是

$$
dP=\lvert\psi(r,\theta,\phi)\rvert^2\,r^2\sin\theta\,dr\,d\theta\,d\phi
$$

这说明 $\lvert\psi(r,\theta,\phi)\rvert^2$ 本身并不是 $(r,\theta,\phi)$ 的联合概率密度：它是相对于物理体积的密度，
换成对坐标 $(r,\theta,\phi)$ 的密度时必须乘上 $r^2\sin\theta$。忘掉这个因子，就会把“单位体积内哪里最拥挤”误读成
“电子最可能在哪个半径上”。第 3 章会把这两件事分开讨论：局域概率密度 $\rho(\mathbf r)$ 与径向分布 $P(r)$。

<figure class="quviz-figure" data-lab="mode=eigenstate&n=1&l=0&m=0&basis=real&rep=slice&plane=xz&obs=probability_density" markdown>
**图 1.2** $1s$ 在 $xz$ 平面上的概率密度切片。亮度 $\propto\lvert\psi\rvert/\max\lvert\psi\rvert$，原子核处最亮；第 3 章会说明，这与“电子最可能出现在哪个半径”是两个不同的问题。这里的“亮度”指色带上的位置：色带位置取 $\lvert\psi\rvert/\max\lvert\psi\rvert=\sqrt{\rho/\rho_{\max}}$，颜色随它单调变亮，因此与概率密度 $\rho$ 本身不成正比。
</figure>

## 全局相位 {#global-phase}

把波函数整体乘上一个模为 1 的常数 $e^{i\alpha}$：

$$
\psi\;\to\;e^{i\alpha}\psi,\qquad \lvert e^{i\alpha}\psi\rvert^2=\lvert\psi\rvert^2
$$

所有概率都不变；对任何算符 $\hat A$，期望值也不变，因为两个相位因子 $e^{-i\alpha}$ 与 $e^{i\alpha}$ 相互抵消。
因此 $\psi$ 与 $e^{i\alpha}\psi$ 描述同一个物理状态，全局相位无法被任何测量确定。

相对相位则不同。若 $\psi=c_1\phi_1+c_2\phi_2$，只把其中一项乘上 $e^{i\alpha}$（$\alpha$ 不是 $2\pi$ 的整数倍），
一般会改变 $\lvert\psi\rvert^2$ 中的干涉项，得到的是另一个物理状态。第 9 章的叠加态依赖这种相对相位；第 7 章的相位切片
展示的则是同一个波函数在不同点之间的相位差，它同样不随全局相位改变。

这也解释了实验室里实轨道各瓣的颜色：哪一瓣是红色（相位 0）、哪一瓣是青色（相位 $\pi$），取决于约定：Condon–Shortley
相位约定、QuViz 对实基的定义，以及径向函数的符号约定（QuViz 让 $R_{n\ell}$ 在原子核附近为正）；把整个波函数换号，
所有可观测量都不变。有意义的只是颜色之间的差别：相邻两瓣颜色相反，说明波函数在它们之间的节面两侧异号。

## 常见误区 {#misconceptions}

!!! warning "误区：ψ 就是电子出现的概率"

    $\psi$ 是概率幅，可以取负值，也可以是复数，本身不能当作概率。概率密度是 $\lvert\psi\rvert^2$；
    要得到概率，还要乘上体积元再积分。

!!! warning "误区：点云里相邻的点是电子先后经过的位置"

    电子云中的每个点都是从 $\lvert\psi\rvert^2d^3r$ 独立抽取的样本，点的顺序没有时间含义。把点连起来得到的
    不是电子的轨迹，只是一条随机折线。

!!! warning "误区：|ψ(r,θ,φ)|² 就是 (r,θ,φ) 的联合概率密度"

    漏掉了体积元。按坐标 $(r,\theta,\phi)$ 计的联合概率密度是 $\lvert\psi\rvert^2r^2\sin\theta$。对 $1s$ 来说，
    $\lvert\psi\rvert^2$ 在原子核处最大，但乘上 $r^2$ 之后，径向概率密度在原子核处为零。

## 思考题 {#exercises}

??? question "思考题 1.1：验证 1s 波函数已归一化（取 Z = a_μ = 1）"

    取 $Z=a_\mu=1$，$\lvert\psi_{100}\rvert^2=\tfrac1\pi e^{-2r}$。在球坐标中积分：

    $$
    \int\lvert\psi_{100}\rvert^2d^3r
    =\int_0^{2\pi}\!\!d\phi\int_0^\pi\!\sin\theta\,d\theta\int_0^\infty\frac1\pi e^{-2r}r^2\,dr
    =4\pi\cdot\frac1\pi\cdot\frac{2!}{2^3}=1.
    $$

??? question "思考题 1.2：基态电子出现在 r ≤ a₀ 的概率是多少？"

    以 $a_0$ 为长度单位并取 $Z=a_\mu=1$，半径 $R$ 的球内概率是

    $$
    P(r\le R)=\int_0^R4r^2e^{-2r}\,dr=1-e^{-2R}\left(1+2R+2R^2\right),
    $$

    对 $R$ 求导得到被积函数，且 $R=0$ 时右边为 0，由此即可验证。取 $R=1$，得到 $P(r\le a_0)=1-5e^{-2}\approx0.323$：
    基态电子大约只有三分之一的概率出现在一个 Bohr 半径以内。

??? question "思考题 1.3：ψ、−ψ 与 iψ 能被哪种测量区分？"

    任何测量都不能。$-\psi=e^{i\pi}\psi$，$i\psi=e^{i\pi/2}\psi$，三者只差一个全局相位，所以一切概率和期望值都相同，
    它们是同一个物理状态。

??? question "思考题 1.4：1s 的局域密度在原子核处最大，为什么「电子恰好在原子核上」的概率却趋于 0？"

    概率等于密度乘体积。半径为 $\varepsilon$ 的小球内的概率约为 $\tfrac43\pi\varepsilon^3\rho(0)$；取 $Z=a_\mu=1$ 时
    $\rho(0)=1/\pi$，概率约为 $\tfrac43\varepsilon^3$，随小球体积一起趋于 0。密度最大不等于概率最大，二者之间差一个体积元。

## 延伸阅读 {#further-reading}

- [坐标与概率测度](../concepts/coordinate-measures.md)：球坐标下的概率测度、氢样轨道的分离，以及“中心最密不等于最可能半径”；
- [可视对象语义](../concepts/semantics.md)：波函数、概率密度、相位、概率流等可视对象的定义与禁止的解释；
- [物理与数值约定](../concepts/conventions.md)：球坐标角度、原子单位、$a_\mu$ 与实基的定义；
- [第 0 章](00-how-to-use.md)：实验室的各个面板和交互图的用法。

波函数的统计诠释见 Griffiths 与 Schroeter 教材第 1 章，三维问题与氢原子见第 4 章
[@griffiths2018qm, chs. 1 and 4 (pp. 3--24, 131--197)]。
