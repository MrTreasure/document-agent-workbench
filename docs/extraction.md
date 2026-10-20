# 从生产书籍处理系统拆分了什么

源项目：`language-learning-platform`。本目录可以单独安装和运行，不通过相邻仓库的符号链接或动态路径加载源码。

| 独立文件 | 原始位置 | 改动 |
| --- | --- | --- |
| `src/workflow.ts` | `packages/content-pipeline/src/workflow.ts` | 保留原节点定义和依赖、事件执行器；独立版选择其中八个步骤 |
| `src/source-sentence.ts` | `apps/worker/src/source-sentence.ts` | 保留来源匹配实现 |
| `src/source-reader.ts` | `apps/worker/src/source-reader.ts` | 保留格式读取结构；移除原挂载白名单和 AZW3 转换依赖，加入独立版大小边界 |
| `src/pipeline.ts` | 结合上述机制重新组织 | 文件缓存、批次、模型结构校验、本地 JSONL 输出 |

独立版是面向代码阅读和场景演示的精简运行链路。原系统的逐页覆盖审计、RapidOCR、spaCy、ECDICT 全量数据、原书双语对齐、管理员鉴权与学习站幂等入库均未伪装成已经迁入。

## 模型和确定性程序的边界

模型只返回译文及词格编号对应的释义。执行器决定阶段顺序、批次大小、重试次数、缓存位置和发布门槛。供应商回答的文本会经过 JSON、Zod、ID 覆盖与来源词格验证；这些检查不能替代语义质量评审。

## 复现记录

本次离线演示用 `examples/reading.txt` 生成四句记录。首次运行没有缓存；第二次运行命中四句缓存，模型请求数始终为零。截图脚本会独立创建数据目录并重复该过程，具体运行 ID 和时间由本机产生，不固定为虚构指标。

本次没有调用付费模型，也没有验证真实供应商的翻译质量。EPUB、DOCX 和文字 PDF 的适配代码已提取，README 截图只验证了 TXT 路线；扫描 PDF 不在本版处理范围内。
