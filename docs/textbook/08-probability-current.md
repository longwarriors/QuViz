# 第 8 章 概率流

前面几章画的都是静止的画面：密度、相位、等密度面。这一章问一个动态的问题：概率在空间中怎样流动？
定态的密度 $\lvert\psi\rvert^2$ 永远不随时间变化，看上去什么都没有发生；但在复基 $m\ne0$ 的定态里，概率一直在绕 $z$ 轴转圈。
描述这种流动的量是概率流密度 $\mathbf j$。它还告诉我们，实验室里的流线应当怎样读，又不应当怎样读。

## 学习目标 {#goals}

读完本章，你应当能够：

- 写出概率流密度 $\mathbf j$ 和连续性方程；
- 解释为什么实波函数没有概率流，而复基 $m\ne0$ 的定态绕 $z$ 轴环流；
- 算出流线上的速率和转一圈所需的时间；
- 区分概率流线与电子的轨迹。

## 概率流密度 {#current}

$$
\mathbf j=\frac{\hbar}{\mu}\operatorname{Im}\left(\psi^*\nabla\psi\right)
$$

$\mathbf j$ 的含义是单位时间内穿过单位面积的概率 [@griffiths2018qm, problem 4.49, eqs. (4.220)--(4.221), pp. 187--188; @probability-current-wikipedia]。
其中 $\mu$ 是电子与原子核的约化质量（第 2 章）；原子核无限重时 $\mu\to m_e$。本章始终把质量写作 $\mu$，以免与磁量子数 $m$ 混淆。

在 $\rho=\lvert\psi\rvert^2>0$ 的地方，总可以把波函数写成振幅乘相位，$\psi=\sqrt\rho\,e^{iS}$。代入定义：

$$
\psi^*\nabla\psi=\sqrt\rho\,\nabla\sqrt\rho+i\rho\,\nabla S,\qquad
\mathbf j=\frac{\hbar}{\mu}\,\rho\,\nabla S
$$

第一项是实数，对 $\mathbf j$ 没有贡献。所以概率流只来自相位的空间变化：**相位沿哪个方向增加，概率就沿哪个方向流**。
这里的 $\nabla S$ 按连续变化的相位计算，相位记法在 $\pm\pi$ 处的折返不算跳变。流的强弱 $\lvert\mathbf j\rvert$ 由两部分决定：$\rho$ 说明那里有多少概率，$\nabla S$ 说明相位变得多快；
流速 $\mathbf v=\mathbf j/\rho=(\hbar/\mu)\nabla S$ 则只取决于相位变得多快，与 $\rho$ 无关。所以第 7 章的相位切片也能用来判断概率流在切片平面内的方向。

## 连续性方程 {#continuity}

概率流与密度由连续性方程联系在一起：

$$
\frac{\partial\rho}{\partial t}+\nabla\cdot\mathbf j=0
$$

它直接来自含时 Schrödinger 方程 $i\hbar\,\partial_t\psi=-\frac{\hbar^2}{2\mu}\nabla^2\psi+V\psi$。对实的势能 $V$（Coulomb 势就是实的），

$$
\frac{\partial\rho}{\partial t}=\psi^*\partial_t\psi+\psi\,\partial_t\psi^*
=\frac{i\hbar}{2\mu}\left(\psi^*\nabla^2\psi-\psi\nabla^2\psi^*\right)=-\nabla\cdot\mathbf j,
$$

势能项在两部分中互相抵消。对任意一块固定的体积积分，再用散度定理，可知块内概率的减少率等于流出边界的概率流通量：
概率不会在一处凭空消失、在另一处凭空出现，只能连续地流过去。这是概率守恒的局域形式
[@griffiths2018qm, problem 4.49, eqs. (4.220)--(4.221), pp. 187--188]。

对定态 $\psi(\mathbf r,t)=\psi(\mathbf r)\,e^{-iEt/\hbar}$，密度不随时间变化，$\partial\rho/\partial t=0$。连续性方程由此只要求

$$
\nabla\cdot\mathbf j=0,
$$

**并不要求 $\mathbf j=0$。** 一盆水绕着盆心匀速旋转，每一处的水量都不变，水却一直在流：定态允许的正是这种没有源和汇的环流。

## 实波函数没有流 {#real-states}

如果 $\psi$ 是实函数，$\psi^*\nabla\psi=\psi\nabla\psi$ 是实数，虚部为零，所以

$$
\mathbf j=\mathbf 0 .
$$

用相位的语言说：实函数的相位只能是 0 或 $\pi$（第 4 章），在 $\rho>0$ 的区域里分片为常数，$\nabla S=\mathbf 0$。
这对 $2p_z$ 成立，对实基中的每一个轨道（$2p_x$、$2p_y$、$3d_{xy}$、$3d_{z^2}$ ……）都成立；复基中 $m=0$ 的态本身就是实函数，同样没有流。
乘上一个常数全局相位不改变结论：$e^{i\alpha}\psi$ 与 $\psi$ 的概率流相同。定态的时间因子 $e^{-iEt/\hbar}$ 正是这样一个全局相位，
所以实轨道在任何时刻都没有概率流。

在实验室里给实基的态选择概率流线，画面上不会出现任何流线，实验室会说明原因：这个态的概率流恒为零。
这是物理上的负对照，不是加载失败。零流不是数值上的小，而是严格的零，所以没有东西可画。

## 复本征态的环流 {#complex-states}

复基本征态可以写成 $\psi_{n\ell m}=R_{n\ell}(r)\,\Theta_{\ell m}(\theta)\,e^{im\phi}$，其中 $R_{n\ell}$ 与 $\Theta_{\ell m}$ 都是实函数。
在球坐标中，梯度的 $r$、$\theta$ 分量只作用在实因子上，给出实数；只有 $\phi$ 分量碰到 $e^{im\phi}$：

$$
\frac{1}{r\sin\theta}\frac{\partial\psi}{\partial\phi}=\frac{im}{r\sin\theta}\,\psi .
$$

所以

$$
\mathbf j=\frac{\hbar m}{\mu\,r\sin\theta}\,\lvert\psi\rvert^2\,\mathbf e_\phi
$$

概率流处处沿方位方向 $\mathbf e_\phi$，也就是绕 $z$ 轴。$m>0$ 时沿 $+\mathbf e_\phi$，从 $+z$ 往下看是逆时针；$m<0$ 时方向相反。
这与 $\mathbf j=(\hbar/\mu)\rho\nabla S$ 的相位图像一致：$S=m\phi+\text{常数}$（常数在节面之间分片取 0 或 $\pi$），相位沿 $\phi$ 增加的方向就是 $m>0$ 时的流向。第 7 章图 7.3 中，$m=+1$ 的相位
沿逆时针方向增加，概率也沿逆时针方向流。

$m$ 与 $-m$ 两个态的密度完全相同：$\lvert e^{im\phi}\rvert^2=1$，而且 $\lvert\Theta_{\ell,-m}\rvert=\lvert\Theta_{\ell m}\rvert$。它们的环流方向却相反。
只看密度（电子云中点的疏密、等密度面的形状、密度切片）无法区分二者，只有相位颜色和概率流能区分。

环流还带着角动量。对任何态都有 $\langle\mathbf L\rangle=\mu\int\mathbf r\times\mathbf j\,dV$。对上面的 $\mathbf j$，
$(\mathbf r\times\mathbf j)_z=r\sin\theta\,j_\phi=\hbar m\rho/\mu$，于是

$$
\mu\int(\mathbf r\times\mathbf j)_z\,dV=\hbar m\int\rho\,dV=\hbar m,
$$

正是第 4 章所说的 $L_z=m\hbar$。实轨道没有流，对应的 $\langle L_z\rangle=0$ 也与第 4 章对 $p_x$ 的计算一致。

实验室的流线图只画线的形状，并用颜色表示速率，不画箭头。所以下面两张图的方向要从公式或相位切片读出，而不能从画面上读出。

<figure class="quviz-figure" data-lab="mode=eigenstate&n=2&l=1&m=1&basis=complex&rep=streamlines" markdown>
**图 8.1** 复基 $2p$、$m=+1$ 的概率流线：每条线都是绕 $z$ 轴的水平圆，从 $+z$ 往下看沿逆时针方向；颜色表示速率 $\lvert\mathbf j\rvert/\rho$，含义以图例胶囊为准。流线不带箭头，逆时针方向来自正文的公式。
</figure>

<figure class="quviz-figure" data-lab="mode=eigenstate&n=2&l=1&m=-1&basis=complex&rep=streamlines" markdown>
**图 8.2** 复基 $2p$、$m=-1$ 的概率流线：密度与图 8.1 完全相同，但环流方向相反。两个态的流线是同一组圆，每一处的速率也相同，而流线又不带箭头，所以这张图看上去与图 8.1 一模一样；方向的区别要到相位切片上看：图 7.3 与图 7.4 中相位增加的方向正好相反。
</figure>

## 流线 {#streamlines}

流线是处处与速度场相切的曲线。这里的速度场是 $\mathbf v=\mathbf j/\rho$。对复基本征态，密度在商中约掉，只剩几何因子：

$$
\mathbf v=\frac{\mathbf j}{\rho}=\frac{\hbar m}{\mu}\,\frac{(-y,\,x,\,0)}{x^2+y^2}
$$

- **每条流线都是圆。** $\mathbf v$ 没有 $z$ 分量，也没有沿柱半径方向的分量，所以流线上柱半径 $s=\sqrt{x^2+y^2}$ 和高度 $z$
  都保持不变：每条流线都是一个水平的、圆心在 $z$ 轴上的圆。
- **速率与周期。** 线速率是 $\lvert\mathbf v\rvert=\hbar\lvert m\rvert/(\mu s)$，角速度是 $\hbar m/(\mu s^2)$，转一圈的时间是
  $2\pi\mu s^2/(\hbar\lvert m\rvert)$。它们只取决于 $m$ 和 $s$，与 $n$、$\ell$、径向函数都无关，因为 $\rho$ 已经约掉了。
- **靠近 $z$ 轴转得最快。** $s$ 越小，线速率和角速度都越大。$z$ 轴本身是 $m\ne0$ 态的节线（波函数含因子 $\sin^{\lvert m\rvert}\theta$），
  那里 $\rho=0$，$\mathbf v$ 没有定义，实验室也不在那里放流线的起点。

实验室在 $\phi=0$ 的半平面上取一组格点，从中挑出密度最大的点作为起点（种子），再从每个种子出发积分出一条流线；
密度低于一个很小阈值的地方不放种子。教材版目录为每个态放 48 个种子。流线上的点按弧长等距排列，速率只用颜色表示，
不会再用点的疏密重复表示一遍。一个圆上的速率处处相同，所以每条流线只有一种颜色；色带的上端是这张图中的最大速率，
数值写在图例胶囊上。

实验室的积分器（四阶 Runge–Kutta）是为一般的速度场写的，并不知道答案是圆。它积分出的每条线都在积分精度内保持 $s$ 与 $z$ 不变，
并在转完一圈后回到起点。这是对数值积分的一个独立检验，而不是把答案直接画了上去。

<figure class="quviz-figure" data-lab="mode=eigenstate&n=3&l=2&m=2&basis=complex&rep=streamlines" markdown>
**图 8.3** 复基 $3d$、$m=2$ 的概率流线：同样是绕 $z$ 轴的圆，角速度 $\hbar m/(\mu s^2)$ 随柱半径 $s$ 增大而减小，靠近 $z$ 轴的圆转得最快。颜色表示的线速率 $\hbar m/(\mu s)$ 也随 $s$ 增大而减小，所以离 $z$ 轴最近的圆落在色带的快端。
</figure>

## 流线不是轨迹 {#not-trajectories}

流线描述的是概率怎样输运：它说明密度分布中的概率从哪里流向哪里、流得多快。它不是实验测得的电子路径。
在标准的量子力学中，电子在两次测量之间没有确定的路径；测量位置得到的是一个按 $\lvert\psi\rvert^2$ 分布的随机点，
测量本身也会改变态。只有在明确采用 Bohm 解释时，才会把这些线称为粒子的轨迹；那是一种解释上的选择，不是计算的结果。

即使在经典的流体里，也只有在流动不随时间变化时，流线才一定与流体微团走过的路径重合。第 9 章会看到，在 $1s+2p_z$
这样的含时叠加态中，概率流随时间变化，流线也不再是绕 $z$ 轴的圆；那时画出的只是某一时刻的瞬时流线，连经典流体意义上的路径都算不上。

## 常见误区 {#misconceptions}

!!! warning "误区：定态的电子是静止的，没有流"

    「定态」只说明密度 $\rho$ 不随时间变化。复基 $m\ne0$ 的定态有一刻不停的环流（图 8.1）；连续性方程只要求 $\nabla\cdot\mathbf j=0$。
    即使在 $\mathbf j=0$ 的实轨道里，电子也不是静止的：$\mathbf j=0$ 只说明概率没有净的输运，而动量平方的平均值
    $\langle p^2\rangle=\hbar^2\int\lvert\nabla\psi\rvert^2\,dV$ 对任何可归一化的波函数都大于零。

!!! warning "误区：流线就是电子的轨道"

    流线是概率流 $\mathbf j/\rho$ 的积分曲线，描述概率的输运，而不是电子走过的路径。电子在两次测量之间没有确定的路径；
    把流线读作轨迹，需要明确采用 Bohm 解释。流线也不是「轨道」（orbital）：轨道指的是波函数本身。

!!! warning "误区：密度相同的两个态无法区分"

    复基 $m$ 与 $-m$ 的密度完全相同，但它们是不同的态：相位绕 $z$ 轴转动的方向相反，概率流的方向相反，$L_z$ 分别是 $m\hbar$ 与 $-m\hbar$。
    在实验室里，两者电子云中点的位置逐点相同，只有相位颜色不同（第 5 章思考题 5.4）；流线图看上去完全一样（图 8.2）；
    相位切片则一眼可辨（图 7.3 与图 7.4）。

## 思考题 {#exercises}

??? question "思考题 8.1：证明任何实波函数的概率流为零。"

    实函数满足 $\psi^*=\psi$，所以 $\psi^*\nabla\psi=\psi\nabla\psi$ 是实数，它的虚部为零，$\mathbf j=(\hbar/\mu)\operatorname{Im}(\psi^*\nabla\psi)=\mathbf 0$。
    乘上一个常数全局相位 $e^{i\alpha}$ 也一样：$(e^{i\alpha}\psi)^*\nabla(e^{i\alpha}\psi)=\psi\nabla\psi$。

??? question "思考题 8.2：复基 2p、m = +1 在 (x, y, z) = (4, 0, 0) a₀ 处的 v 是多少（原子单位，μ = 1）？"

    代入 $\mathbf v=(\hbar m/\mu)(-y,x,0)/(x^2+y^2)$，其中 $\hbar=\mu=1$、$m=1$：

    $$
    \mathbf v=\frac{(0,\,4,\,0)}{16}=(0,\,0.25,\,0)\ \text{a.u.}
    $$

    速度沿 $+y$ 方向，也就是从 $+z$ 往下看的逆时针方向。这条流线的半径 $s=4a_0$，转一圈需要 $2\pi s/\lvert\mathbf v\rvert=32\pi\approx100.5\,\hbar/E_h$，
    约 2.43 fs。

??? question "思考题 8.3：复基 3d、m = 2 在柱半径 s = 2 a₀ 处的流线转一圈要多久？"

    角速度是 $\hbar m/(\mu s^2)=2/2^2=0.5$（原子单位），所以

    $$
    T=\frac{2\pi}{0.5}=4\pi\approx12.57\,\hbar/E_h,
    $$

    约 0.30 fs。这条圆上的线速率是 $m/s=1$ a.u.。

??? question "思考题 8.4：密度不随时间变化，概率流却不为零，这与连续性方程矛盾吗？"

    不矛盾。纯方位方向的场 $\mathbf j=j_\phi\,\mathbf e_\phi$ 的散度是

    $$
    \nabla\cdot\mathbf j=\frac{1}{r\sin\theta}\frac{\partial j_\phi}{\partial\phi},
    $$

    而 $j_\phi=\hbar m\lvert\psi\rvert^2/(\mu\,r\sin\theta)$ 不依赖 $\phi$，所以 $\nabla\cdot\mathbf j=0=-\partial\rho/\partial t$。
    概率沿闭合的圆流动，每一处流进多少就流出多少，密度保持不变。

## 延伸阅读 {#further-reading}

- [概率流](../concepts/probability-current.md)：定态流线为什么是精确的圆，以及数值实现中的密度阈值与连续性检查；
- [第 4 章](04-real-complex.md)：复球谐、实球谐与磁量子数 $m$ 的含义；
- [第 7 章](07-phase-slices.md)：相位切片，读出相位增加的方向，就读出了概率流的方向。

概率流的定义与连续性方程，见 Griffiths 书中关于概率流的习题 [@griffiths2018qm, problem 4.49, eqs. (4.220)--(4.221), pp. 187--188]。
