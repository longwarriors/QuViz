# 附录 B 符号与单位

这个附录集中列出全书使用的单位、坐标约定、符号、表示法的名称，以及实验室深链接的写法，供阅读各章时查阅。

## 原子单位 {#atomic-units}

本书和实验室都使用原子单位：$\hbar=e=m_e=4\pi\varepsilon_0=1$。长度以 Bohr 半径 $a_0$ 为单位（界面上写作 bohr），
能量以 hartree $E_h$ 为单位（写作 Ha），时间以 $\hbar/E_h$ 为单位。换算成国际单位制时用下表：

| 量 | 原子单位 | 数值（6 位有效数字） |
|---|---|---|
| 长度 | $a_0$ | 0.529177 Å |
| 能量 | $E_h$ | 27.2114 eV |
| 时间 | $\hbar/E_h$ | 24.1888 as |
| 速度 | $a_0E_h/\hbar$ | $2.18769\times10^6$ m/s |

计入原子核的有限质量时，要用电子与原子核的约化质量 $\mu$ 代替 $m_e$。本书用无量纲的 $a_\mu=m_e/\mu$ 记录这一修正，
对氢原子 $a_\mu\approx1.000545$；长度按 $a_\mu/Z$ 缩放，能量按 $Z^2/a_\mu$ 缩放，能级为
$E_n=-Z^2/(2a_\mu n^2)$ Ha [@griffiths2018qm, ch. 4 (pp. 131--197)]。教材版实验室取 $Z=1$、$a_\mu=1$，
也就是原子核无穷重的氢原子。

## 坐标约定 {#coordinates}

$\theta\in[0,\pi]$ 是极角，即与 $+z$ 轴的夹角；$\phi\in[0,2\pi)$ 是方位角，从 $+x$ 轴转向 $+y$ 轴。直角坐标与球坐标的关系是

$$
x=r\sin\theta\cos\phi,\qquad
y=r\sin\theta\sin\phi,\qquad
z=r\cos\theta.
$$

球谐函数由 SciPy 的 `sph_harm_y` 求值，包含 Condon–Shortley 相位 [@scipy-sph-harm-y]。实基的定义见
[物理与数值约定](../concepts/conventions.md)；在这个约定下，$\ell=1$ 的三个实基函数 $m=1$、$m=-1$、$m=0$
分别是 $p_x$、$p_y$、$p_z$。实验室的 $z$ 轴朝上。

## 符号表 {#symbols}

| 符号 | 含义 | 单位 |
|---|---|---|
| $\psi$、$\Psi$ | 波函数；$\Psi$ 特指含时的波函数，本书用于叠加态 | $\mathrm{bohr}^{-3/2}$ |
| $\rho=\lvert\psi\rvert^2$ | 概率密度：单位体积内找到电子的概率 | $\mathrm{bohr}^{-3}$ |
| $P(r)$ | 径向分布 $r^2\lvert R_{n\ell}\rvert^2$：单位半径间隔内找到电子的概率 | $\mathrm{bohr}^{-1}$ |
| $R_{n\ell}$ | 径向函数 | $\mathrm{bohr}^{-3/2}$ |
| $Y_\ell^m$ | 复球谐函数，在单位球面上归一化；实基函数写作 $Y_{\ell m}^{\mathrm{real}}$ | 无量纲 |
| $n,\ell,m$ | 主量子数、角量子数、磁量子数：$n\ge1$，$0\le\ell\le n-1$，$-\ell\le m\le\ell$ | 无量纲 |
| $Z$ | 核电荷数，原子核带电 $Ze$ | 无量纲 |
| $a_\mu$ | $m_e/\mu$，约化 Bohr 半径与 $a_0$ 之比 | 无量纲 |
| $\mu$ | 电子与原子核的约化质量 | $m_e$ |
| $E_n$ | 能级 $-Z^2/(2a_\mu n^2)$ | Ha |
| $\mathbf j$ | 概率流密度 $(\hbar/\mu)\operatorname{Im}(\psi^*\nabla\psi)$ | a.u.，即 $\mathrm{bohr}^{-2}\,E_h/\hbar$ |
| $\mathbf v$ | 流速 $\mathbf j/\rho$ | a.u.，即 $a_0E_h/\hbar$ |
| $\omega$ | 两项叠加的角频率，等于两项能量之差除以 $\hbar$ | $E_h/\hbar$ |
| $T$ | 振荡周期 $2\pi/\omega$ | $\hbar/E_h$ |
| $c_k$ | 叠加系数，是复数；$\Psi$ 归一化、各项又正交归一时 $\sum_k\lvert c_k\rvert^2=1$ | 无量纲 |

## 表示法与场 {#representations}

实验室把“怎样画”（表示法，representation）和“画什么”（场，observable）分开。下表左列是界面上的名称，
中列是它们在深链接里的写法，也就是 `rep` 与 `obs` 两个键的取值。

| 界面名称 | 请求中的名称 | 含义 |
|---|---|---|
| 电子云 | `point_cloud` | 从 $\lvert\psi\rvert^2d^3r$ 独立抽取的位置样本；叠加态不画电子云 |
| 等密度面 | `isosurface` | 曲面 $\lvert\psi\rvert^2=c$，常数 $c$ 取得使 $\lvert\psi\rvert^2\ge c$ 的区域包含给定的概率（教材版为 90 %） |
| 平面切片 | `slice` | 在 xy、xz 或 yz 平面上采样下面四种场之一，用颜色画出 |
| 概率流线 | `streamlines` | 处处与流速 $\mathbf v=\mathbf j/\rho$ 相切的曲线 |
| $\lvert\psi\rvert^2$ | `probability_density` | 概率密度 |
| $\operatorname{Re}\psi$ | `wavefunction_real` | 波函数的实部 |
| $\operatorname{Im}\psi$ | `wavefunction_imag` | 波函数的虚部 |
| $\arg\psi$ | `phase` | 波函数的相位；振幅太小、相位无法定义的地方显示为透明 |

## 深链接语法 {#deep-links}

实验室地址中 `#` 之后的部分叫深链接。它由若干 `key=value` 对组成，用 `&` 连接；实验室按
`embed, mode, n, l, m, z, basis, preset, t, rep, plane, obs` 的顺序写出这些键。本书的交互图在最前面加上 `embed=1`，
让实验室以嵌入模式运行。实验室会忽略不认识的键和不合法的值，没有写出的部分取实验室的默认值。

下表列出各个键，以及教材版的预计算目录覆盖的取值：

| 键 | 含义 | 教材目录覆盖的取值 |
|---|---|---|
| `mode` | 本征态或叠加态 | eigenstate、superposition |
| `n` | 主量子数 | 1–4 |
| `l` | 角量子数 $\ell$ | 0…n−1 |
| `m` | 磁量子数 | −l…l |
| `basis` | 本征态所用的基 | real、complex |
| `preset` | 叠加态预设 | 1s-2pz、2s-2pz、1s-3dz2、2pplus-2pminus |
| `t` | 叠加态的时刻，单位 $\hbar/E_h$ | 该预设在播放器上的各帧 |
| `rep` | 表示法 | point_cloud、isosurface、slice、streamlines |
| `plane` | 切片平面 | xy、xz、yz（叠加态只有 xz） |
| `obs` | 切片上画的场 | probability_density、wavefunction_real、wavefunction_imag、phase |

`n`、`l`、`m`、`basis` 描述本征态，`preset` 与 `t` 描述叠加态，`plane` 与 `obs` 只对平面切片起作用。
不写 `t` 就是 $t=0$。例如 $1s+2p_z$ 的播放器有 28 帧，依次是 0、0.6、1.2、…、16.2；两个能量简并的预设
（2s-2pz 与 2pplus-2pminus）密度不随时间变化，只有 $t=0$ 一帧。

两个例子：

- `#mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud`：实基 $2p_z$ 的电子云，也就是实验室的默认场景（图 0.1）；
- `#mode=superposition&preset=1s-2pz&t=8.4&rep=slice&plane=xz&obs=probability_density`：$1s+2p_z$ 叠加态在
  $t=8.4\,\hbar/E_h$ 时 $xz$ 平面上的概率密度切片（图 B.1）。

本地实时版还接受 `z`（核电荷数），以及经过验证的范围内超出教材目录的其他取值，例如更大的 $n$。

<figure class="quviz-figure" data-lab="mode=superposition&preset=1s-2pz&t=8.4&rep=slice&plane=xz&obs=probability_density" markdown>
**图 B.1** 上面第二个示例深链接所描述的状态：$1s+2p_z$ 叠加态在 $t=8.4\,\hbar/E_h$（约半个周期，$T=16\pi/3\approx16.755\,\hbar/E_h$）时 $xz$ 平面上的概率密度切片，$\langle z\rangle\approx-0.745\,a_0$。点“在实验室中打开”，可以在新标签页里从这一帧继续播放或切换表示法。
</figure>
