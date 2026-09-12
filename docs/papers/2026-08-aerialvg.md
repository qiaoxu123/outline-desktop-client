# 📖 AerialVG：用位置关系解决航拍视觉定位中的同类目标歧义

> **一句话总结**：AerialVG 将航拍视觉定位从“找出像描述的目标”推进到“利用周围目标的位置关系选对目标”，并用分层交叉注意力与关系感知 grounding 同时处理小目标和同类目标歧义。

| 属性 | 详情 |
|------|------|
| 论文链接 | [arXiv:2504.07836](https://arxiv.org/abs/2504.07836) · [alphaXiv](https://www.alphaxiv.org/abs/2504.07836) · [DOI](https://doi.org/10.48550/arXiv.2504.07836) |
| 代码仓库 | [Ideal-ljl/AerialVG](https://github.com/Ideal-ljl/AerialVG) |
| 数据集 | [Hugging Face AerialVG](https://huggingface.co/datasets/IPEC-COMMUNITY/AerialVG) |
| 论文标题 | AerialVG: A Challenging Benchmark for Aerial Visual Grounding by Exploring Positional Relations |
| 作者 | Junli Liu，Qizhi Chen，Zhigang Wang，Yiwen Tang，Yiting Zhang，Chi Yan，Dong Wang，Xuelong Li，Bin Zhao |
| 机构 | 西北工业大学、上海人工智能实验室、浙江大学、TeleAI |
| 发表时间 | ICCV 2025，pp. 5177–5187；arXiv v4 于 2025 年 10 月 8 日更新 |
| 领域 | 航拍视觉定位、UAV 感知、视觉语言、空间关系推理、遥感视觉 |

## Q1. 痛点

想象一架无人机俯拍拥挤停车场。地面视角下很容易说“左边那辆红车”，但从空中看，画面里可能有十几辆大小和颜色都接近的红车。此时“它长什么样”已经不够，必须继续说“白色轿车上方、蓝色 SUV 右侧的那辆红车”。AerialVG 要求模型完成的正是这种带参照物的定位。

传统 visual grounding（视觉定位）通常把一句 referring expression（指代表达）和图像中的一个目标框对齐。RefCOCO 等数据集主要来自地面视角，目标相对大，语言描述常依赖颜色、类别和局部外观。航拍场景改变了这个假设：视野更宽，目标更小，建筑、道路等无关区域占比更大，而且同类车辆、行人密集重复出现。仅靠外观相似度，模型往往能把目标召回到 Top-5，却无法在 Top-1 位置选中正确实例。

现有方法的局限有两层。第一，标准 cross-attention 把不同尺度的图像特征展平后统一处理，容易在高层特征中丢掉小目标的空间位置。第二，普通 grounding 主要让文本和单个候选框匹配，没有显式建模“目标—辅助目标”的关系，因此难以解释“目标在某物上方、左侧或右上方”这类描述。

现实影响是：在 UAV 搜索救援、交通巡检、生态监测和物流投送中，模型把“相似目标”选错，可能导致无人机跟错车辆、救援资源投错位置，或导航系统对场景产生错误判断。

**核心痛点**：航拍视觉定位同时需要细粒度小目标检索和基于周围目标的关系消歧，而传统 grounding 模型主要解决的是单目标外观匹配。

## Q2. 方法

![Fig. 5 — AerialVG 模型框架：Swin 层级特征、Hierarchical Cross-Attention 与 Relation-Aware Grounding](https://arxiv.org/html/2504.07836/method.png)

> **Fig. 5（框架图）**：该图比较 Grounding DINO 的普通图文融合与 AerialVG 的两阶段增强。AerialVG 先用 BERT 文本特征和 Swin Transformer 的多尺度图像特征做分层交叉注意力，再由 decoder 生成候选目标特征，最后用关系感知模块比较候选目标两两之间的空间关系。这样，模型先解决“哪里可能有目标”，再解决“哪个候选才符合位置描述”。

### 创新 1：Hierarchical Cross-Attention

**问题**：航拍图像分辨率高、背景面积大，小目标在深层低分辨率特征中容易被淹没。普通 cross-attention 将层级特征展平，文本对某个位置的关注不能稳定传递到其他尺度。

**解法**：Swin Transformer 输出多层空间特征，在各层计算文本—图像注意力图 $A_i$。作者把最高层的注意力通过 bilinear interpolation 传播到低层，并把第一层的细粒度注意力通过 convolution 对齐到最高层：

$$
A_n^*=(1-\beta)A_n+\beta C(A_1)
$$

$$
A_i^*=(1-\alpha)A_i+\alpha F(A_{i+1})
$$

$C(\cdot)$ 是卷积对齐操作，$F(\cdot)$ 是双线性插值，$\alpha$ 和 $\beta$ 控制跨层注意力传播强度。其直觉是：高层提供语义筛选，低层保留小目标的位置细节。

**效果**：在 AerialVG 消融中，单独加入该模块后 Top-5 从 78.87 升到 82.32，提升 3.45 个百分点，但 Top-1 只从 29.36 升到 29.78。这说明它主要提高候选召回和细节检索，还没有真正解决同类实例之间的关系消歧。

关键配置：

```
Image backbone: Swin-L
Text backbone: BERT-base
Image feature levels: 4（4×–32×）
Encoder layers: 6
Decoder layers: 6
Max text tokens: 256
alpha: 0.2
beta: 0.3
```

### 创新 2：Relation-Aware Grounding

**问题**：decoder 已经产生了候选目标特征，但普通分类头更擅长判断“像不像文本描述”，不擅长判断“目标与另一个对象的相对位置是否符合描述”。

**解法**：设 decoder 输出 $m$ 个候选特征。模型将候选两两拼接，得到 $m^2$ 个关系候选，再通过 self-attention 和文本 cross-attention 建立对象对与关系词之间的匹配。最后得到关系矩阵 $M\in\mathbb{R}^{m\times m}$，对每个候选取行最大值作为关系分数，并与 class head 的外观分数合并：

$$
\mathcal{L}_{rel}=-\log\left(\frac{e^{m_{i,j}}}{\sum_{i,j}e^{m_{i,j}}}\right)
$$

$m_{i,j}$ 表示第 $i$ 个目标候选与第 $j$ 个辅助对象构成的关系匹配分数。Hungarian matching（匈牙利匹配）负责把预测对象和标注目标、辅助对象配对，关系损失则把正确的对象对推高。

**效果**：单独加入关系模块后 Top-1 从 29.36 升到 45.63，提升 16.27 个百分点，但 Top-5 从 78.87 变为 79.63，仅提升 0.76 个百分点。这正好验证了模块分工：它不是负责发现更多候选，而是从已有候选中选出关系正确的那个。

### 创新 3：专门的 AerialVG 数据与两阶段训练

**问题**：如果关系模块直接在小规模航拍数据上从头学习，模型可能同时面对检测、语言对齐和关系推理三个不稳定因素。

**解法**：第一阶段沿用 Grounding DINO 的训练方式，在现有视觉定位数据集上训练不含 Relation-Aware Grounding 的基础模型，使图文定位先收敛。第二阶段冻结其他参数，只用 AerialVG 训练关系模块，让新增参数专门学习航拍场景中的对象关系。

**效果**：完整模型在 AerialVG 上达到 Fine-Tuning Top-1 50.01、Top-5 87.00，相比 Grounding DINO 基线分别提升 20.65 和 8.13 个百分点。由于第二阶段只训练关系模块，收益更接近“关系建模带来的增益”，但仍不能排除第一阶段基础模型和数据分布的共同影响。

**一句话精炼核心创新**：用跨层注意力守住航拍小目标，用对象对关系矩阵完成同类目标消歧，并通过分阶段训练把两种能力分开优化。

| 方法类别 | 代表方法 | 核心局限 |
|------|------|------|
| 两阶段 visual grounding | TransVG 等 | 候选区域与语言匹配较强，但对航拍小目标和空间关系适配不足。 |
| 动态 query grounding | Dynamic-MDETR | 能动态选择候选，但主要仍依赖外观与图文匹配。 |
| 通用 open-set grounding | Grounding DINO | 泛化性强，但没有显式的目标—辅助目标关系分支。 |
| AerialVG | Swin-L + 分层注意力 + 关系感知 | 面向航拍关系定位，但关系建模的计算量随候选数平方增长。 |

## Q3. 效果

### Q3.1 核心指标对比

| 任务 / 数据集 | 设置 | Top-1 | Top-5 | 对比与解读 |
|------|------|------:|------:|------|
| AerialVG | Grounding DINO fine-tuning | 29.36 | 78.87 | 航拍领域适配后能找回候选，但 Top-1 消歧仍弱。 |
| AerialVG | AerialVG fine-tuning | **50.01** | **87.00** | Top-1 提升 20.65，Top-5 提升 8.13 个百分点。 |
| AerialVG 消融 | + Hierarchical Cross-Attention | 29.78 | 82.32 | 主要改善细节检索和候选召回。 |
| AerialVG 消融 | + Relation-Aware Grounding | 45.63 | 79.63 | 主要改善关系消歧。 |
| RefCOCO | AerialVG model，Swin-L | 90.58 / 93.23 / 88.56 | — | val / testA / testB，保持通用 grounding 能力。 |
| RefCOCO+ | AerialVG model，Swin-L | 82.83 / 89.02 / 76.03 | — | val / testA / testB，禁用直接位置词后仍具竞争力。 |
| RefCOCOg | AerialVG model，Swin-L | 86.52 / 88.04 | — | val / test，说明关系模块没有明显破坏地面视角定位。 |

### Q3.2 实验设置速览

| 数据集 / 场景 | 任务 | 规模与特点 | 承担作用 |
|------|------|------|------|
| AerialVG | 航拍 referring expression grounding | 5,000 张高分辨率 UAV 图像、约 50,000 条人工描述、103,000 个对象；源自 VisDrone2019 | 主任务，验证小目标与位置关系推理。 |
| VisDrone2019 | UAV 检测数据 | 288 个视频片段、261,908 帧、10,209 张静态图像，覆盖 14 个城市 | AerialVG 的图像来源与第一阶段视觉预训练基础。 |
| RefCOCO | 地面视角视觉定位 | 常规自然图像中的目标指代表达 | 检查新增模块是否损害通用 grounding。 |
| RefCOCO+ | 受限位置词视觉定位 | 更少依赖直接空间词 | 检验模型在外观与上下文匹配上的泛化。 |
| RefCOCOg | 长指代表达定位 | 描述更长、语言关系更复杂 | 检验长文本条件下的图文对齐。 |

### 对比方法与公平性

| 方法 | 类别 | 核心思想 | 为什么比较 |
|------|------|------|------|
| TransVG | 端到端 grounding | 直接用 Transformer 融合图文并回归框 | 代表基础一阶段 / 端到端定位能力。 |
| Dynamic-MDETR | 动态注意力 grounding | 用动态注意力选择与文本相关的区域 | 检验动态候选机制对航拍场景的适应性。 |
| SimVG | 解耦多模态融合 | 将视觉与语言融合过程拆分以降低复杂度 | 代表较新的通用 VG 基线。 |
| Grounding DINO | open-set grounding | DINO 检测器与 grounded pre-training | 本文直接改造的强基线。 |
| AerialVG | 航拍关系 grounding | 层级注意力＋关系感知模块 | 验证两项新增机制的互补性。 |

协议上，作者使用 Swin-L 图像 backbone、BERT-base 文本 backbone，提取 4 个尺度的图像特征，encoder 和 decoder 各 6 层，最大文本长度 256。损失由 contrastive / classification、L1、GIoU 和 relation loss 组成，权重分别为 1.0、5.0、2.0 和 1.0。论文没有给出统一的多随机种子方差、显著性检验或完整训练资源，因此应把结果视为单次 benchmark 点估计。

### Q3.3 关键发现分析

1. **航拍数据域本身比模型结构更先造成性能瓶颈。** 现有模型 zero-shot Top-1 和 Top-5 大多只有约 2%–11% 和 4%–14%，fine-tuning 后 Grounding DINO 的 Top-5 达到 78.87，但 Top-1 只有 29.36。说明模型不是完全找不到目标，而是在同类候选之间选不准。

2. **分层注意力主要解决“看见候选”的问题。** 加入 Hierarchical Cross-Attention 后 Top-5 提升 3.45 个百分点，而 Top-1 几乎不变。原因是跨层传播让小目标在高层语义筛选后仍得到低层细节支持，但它没有直接告诉模型哪一个候选与辅助对象满足“左上方”等关系。

3. **关系模块主要解决“选对实例”的问题。** 仅加入 Relation-Aware Grounding 后 Top-1 提升 16.27 个百分点，远大于 Top-5 的 0.76 个百分点。它利用对象对和关系文本重排候选，正好针对“候选已经找到了、但外观相似导致选错”的错误模式。

4. **两个模块具有互补性，但不能把全部提升都归因于关系推理。** 联合模型达到 Top-1 50.01、Top-5 87.00，说明细节召回和关系消歧必须同时存在。与此同时，AerialVG 仍明显优于单独 Relation 的 45.63，表明小目标特征质量会限制关系推理上限。

5. **通用定位能力基本保持，但“竞争力”不等于全面领先。** 在 RefCOCO 系列上模型接近或略高于 Grounding DINO，说明关系模块没有造成明显退化；但这些数据集的视角、目标尺度和关系复杂度与 UAV 场景不同，不能据此证明模型已经具备跨平台空间推理能力。

### Q3.4 涌现行为与意外发现

最有价值的意外现象是：Top-5 与 Top-1 的提升被两个模块清晰分工。Hierarchical Cross-Attention 提高“候选池质量”，Relation-Aware Grounding 提高“候选池内的排序质量”。这让 Top-1 / Top-5 不只是两个汇报指标，还成为诊断 grounding 错误类型的工具。

### Q3.5 图表与结果详细解释

![Fig. 1 — AerialVG 数据样例：同类车辆需要借助辅助对象的位置关系定位](https://arxiv.org/html/2504.07836/figure/AerialVG.png)

> **Fig. 1 三连说明**：该图展示多个外观相似目标和带辅助对象的语言描述。它比较的不是模型分数，而是传统“属性匹配”与“关系定位”所需信息的差异。结论是同类目标越密集，位置关系越可能成为决定性证据。

![Fig. 2 — AerialVG 的分辨率分布与描述词云](https://arxiv.org/html/2504.07836/res_wc.png)

> **Fig. 2 三连说明**：该图展示数据的高分辨率特征以及 vehicle type、color、location 等词频。它说明数据的难点同时来自视觉尺度和语言关系，而不是单纯增加图片数量。

![Fig. 4 — AerialVG 与传统 visual grounding 数据集的难度对比](https://arxiv.org/html/2504.07836/figure/dataset_compare.png)

> **Fig. 4 三连说明**：该图比较文本长度、每图对象数量和无关区域比例。AerialVG 在这些维度上更难，因此传统数据集上的高分不能直接代表航拍 grounding 性能。

表 1 的 Top-1 / Top-5 差距很大，说明“找得到相似目标”与“能利用关系选对目标”是两个不同能力。表 3 的单模块消融进一步把这个差距拆开：注意力模块带来 Top-5 收益，关系模块带来 Top-1 收益，完整模型则同时获得两者。

真实图片定性实验使用 DJI M30T 在 50 米高度采集的 4000×3000 图像。该实验能证明方法可以离开 VisDrone2019 的数据分布做一次小规模迁移，但样本量、场景覆盖、飞行路线和失败案例没有充分报告，不能替代系统性的跨城市、跨高度和跨天气评估。

### 核心洞察

AerialVG 的真正贡献不是又增加一个 grounding backbone，而是把视觉定位错误拆成“候选召回不足”和“关系消歧不足”两个阶段，并让 Top-5 与 Top-1 分别观察这两种能力。这个诊断框架比单一 accuracy 更适合分析 UAV 场景中的空间智能。

## Q4 深度展开

### Q4.1 方法深度拆解

AerialVG 的数据标注采用观察者视角，将位置关系分成 above、below、left、right、top-left、top-right、bottom-left、bottom-right 八类。辅助对象优先选择距离目标最近且足以完成定位的显著对象，避免把无关对象全部写入描述。这个标注策略降低了语言冗余，却也引入一个假设：最近的显著对象通常能提供最可靠的消歧线索。

Relation-Aware Grounding 的 $m^2$ 对象组合是表达能力与计算量之间的直接取舍。若 decoder 有 $m$ 个候选，关系特征数量随 $m^2$ 增长；候选较多时，self-attention、文本 cross-attention 和关系矩阵都可能成为瓶颈。作者用每行最大关系分数聚合辅助对象，这是一种简单有效的 hard selection，但它可能忽略多个辅助对象共同构成的组合关系，也没有输出关系不确定性。

### Q4.2 实验补充

模型采用 Swin-L 与 BERT-base，图像特征来自 4、8、16、32 倍下采样层。损失为

$$
\mathcal{L}=\mathcal{L}_{reg}+\mathcal{L}_{cls}+\mathcal{L}_{rel}
$$

其中回归项包含 L1 与 GIoU，分类项采用类似 GLIP 的图文对比损失，关系项由 Hungarian matching 后的对象对监督。论文给出的实现细节较完整，但没有报告 batch size、epoch、优化器、GPU 数量、训练时长和推理 FPS，这限制了对可复现性与部署成本的判断。

代码仓库截至作者 README 已公开数据集、inference code 和 checkpoint，training code 仍标为 coming soon。因此现阶段可以复现实验推理和评测流程，但不能完整复现训练管线或方便地替换关系模块做公平新实验。

### Q4.3 方法优势

✅ 关系模块的消融增益与任务痛点高度匹配：Top-1 提升远大于 Top-5，说明它确实在处理实例消歧。

✅ 分层注意力没有依赖额外的大型三维重建模块，能直接利用已有 Swin 多尺度特征，工程接入成本相对可控。

✅ AerialVG 模型在 RefCOCO、RefCOCO+ 和 RefCOCOg 上保持竞争力，说明航拍专用关系建模没有明显破坏常规目标 grounding。

### Q4.4 方法局限

⚠️ 关系标签只覆盖八个二维方向，不能表达相对距离、遮挡深度、朝向、速度或三维高度关系；真实 UAV 任务常需要这些信息。

⚠️ 辅助对象选择优先最近显著对象，若最近对象被遮挡、检测不稳定或本身同样具有歧义，关系监督可能变成错误线索。

⚠️ $m^2$ 对象配对带来候选数平方级增长，密集航拍场景中需要候选裁剪、稀疏关系图或近邻检索。

⚠️ 数据来自 VisDrone2019，且真实 DJI M30T 实验规模有限；跨传感器、跨高度、跨城市和跨天气泛化仍未被充分验证。

⚠️ 论文的主要 benchmark 是静态单帧 grounding，尚未证明关系 grounding 能直接改善 UAV 轨迹规划、主动搜索或闭环导航。

### Q4.5 实际部署考虑

部署时，模型至少需要把高分辨率图像切片或缩放到可处理的尺寸，同时保持小目标的像素细节。关系模块应设定候选数上限，并优先构建空间近邻图，避免所有候选两两组合。对低空巡检而言，还应把检测框坐标转换到地面平面或地图坐标，并在相机姿态、飞行高度和地形起伏变化时重新校准。

已知 failure mode 包括：目标尺寸低于特征 stride 后消失，辅助对象被遮挡，八方向标签无法表达斜向或距离细节，图像中道路或建筑等背景结构未被正确识别，以及模型给出高分但关系链实际不成立。安全系统应保留候选框、关系分数和置信度，而不是只输出一个最终框。

### Q4.6 后续研究方向

1. **从二维关系到三维关系**：加入深度、相对距离、地面坐标和高度差，解决“上方”在透视变化下的歧义。
2. **稀疏关系图**：用空间近邻、类别互补和语言触发词筛选对象对，把 $m^2$ 复杂度降为稀疏图消息传递。
3. **视频与主动搜索**：把当前帧 grounding 与 UAV 运动、视角选择和记忆结合，评价模型是否能主动飞到更容易消歧的位置。
4. **鲁棒性与不确定性**：系统注入缺失视角、运动模糊、压缩、低照度和高度变化，输出关系级置信度与拒答机制。

### Q4.7 相关论文推荐

| 论文 | 关系 | 推荐理由 |
|------|------|------|
| Grounding DINO | 直接基线 | AerialVG 在其图文 grounding 框架上加入航拍专用模块。 |
| AerialVLN | UAV 视觉语言导航 | 将静态目标定位扩展到 UAV 指令跟随与导航闭环。 |
| SpatialVLM | 视觉语言空间推理 | 对照显式关系模块与 VLM 隐式空间推理的差异。 |
| OpenFly | 航空视觉语言 benchmark | 关注 UAV 场景中的大规模视觉语言任务与导航评测。 |
| GrabVG | 后续 UAV visual grounding | 用候选假设搜索与图注意力处理航拍同类目标歧义，可作为后续方法对比。 |

### Q4.8 对我们研究的参考价值

| 方向 | 相关度 | 本文与该方向的连接点 |
|------|:---:|------|
| 边缘计算 / 端边云协同 | 中 | 高分辨率切片、候选裁剪和稀疏关系图都对应端侧算力预算。 |
| 自动驾驶 | 中 | 目标—辅助目标关系可迁移到道路参与者定位与交互理解。 |
| 低空无人机 | 强 | 论文直接面向 UAV 航拍感知、目标定位和空间关系推理。 |
| VLN | 强 | grounding 是导航指令落地到可见目标和空间位置的关键前置能力。 |

**关联点**

1. **低空无人机**：将关系矩阵扩展到 UAV 的目标—地标—航迹节点图，支持搜索救援和巡检目标定位。
2. **VLN**：把“目标在参照物左上方”等 referring expression 作为导航记忆的可验证 grounding 约束。
3. **边缘计算**：按任务难度动态选择高分辨率局部裁剪、候选数和关系层数，在端侧延迟预算下保留 Top-1 消歧能力。
4. **自动驾驶**：把车辆、行人和道路结构组织为关系图，帮助模型区分同类交通参与者并服务 V2X 场景理解。

**可复用技术点**

1. 复用 Top-1 / Top-5 双指标诊断协议，区分候选召回失败与实例排序失败。
2. 复用分层注意力跨尺度传播机制，保护小目标在高层语义融合中的空间证据。
3. 复用“基础模型先收敛、关系模块后适配”的两阶段训练，降低新关系监督对原有 grounding 能力的破坏。
4. 复用 Hungarian matching 监督目标—辅助对象配对，并将关系分数与目标分类分数联合排序。

**值得跟进实验**

1. 在 UAV 真实飞行数据中加入高度、姿态、地理坐标和时间序列关系，比较二维八方向与三维关系图的定位差异。
2. 设计缺失辅助对象、错误辅助对象和关系词替换实验，测量模型是否真正依赖关系而不是记忆外观。
3. 以 Top-1、关系准确率、端侧 FPS、显存和能耗为联合目标，比较全连接关系模块与稀疏近邻图。

**选题启发**

- **期刊方向**：面向低空 UAV 的关系感知视觉语言导航，联合建模目标 grounding、主动视角选择、三维地图和闭环安全，可对标 IEEE T-ITS、T-IV、RA-L 或 TPAMI。
- **会议方向**：提出带不确定性估计的稀疏 Relation-Aware Grounding，在缺视角和高度变化条件下验证 Top-1 消歧与实时性，可对标 ICRA、IROS、CVPR 或 CoRL。

## 参考文献

- Junli Liu et al.，[AerialVG](https://arxiv.org/abs/2504.07836)，ICCV 2025。
- Shilong Liu et al.，[Grounding DINO](https://arxiv.org/abs/2303.05499)，2023。
- Shubo Liu et al.，[AerialVLN](https://arxiv.org/abs/2308.06787)，2023。
- Yunpeng Gao et al.，[OpenFly](https://arxiv.org/abs/2502.18041)，2025。
- Boyuan Chen et al.，[SpatialVLM](https://arxiv.org/abs/2401.12168)，2024。
