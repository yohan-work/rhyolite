# Rhyolite - Slack in R

YOBOT_v1.0.0

## 프로젝트 개요
Rhyolite(YOBOT)는 Slack 환경에서 동작하는 지능형 챗봇 프로젝트입니다. 사용자가 업로드한 다양한 문서(PDF, TXT, PPTX 등)를 분석하여 질문에 대한 정확한 답변을 제공합니다.

## 프로젝트 적용 방식 (Implementation Details)

### 개방형 정보 추출 (Open Information Extraction)
전문가가 수동으로 온톨로지 규칙을 정의하고 데이터를 입력하는 전통적인 방식 대신, 본 프로젝트는 LLM(Ollama)의 자연어 이해 능력을 활용합니다. 프롬프트 엔지니어링을 통해 문서를 읽고 스스로 개체와 관계를 동적으로 추출하여 지식 그래프를 구축합니다.

### 데이터 파이프라인 로직

1. **Ingest (인덱싱)**
   - 업로드된 문서들을 파싱하여 의미 있는 크기의 텍스트 조각(Chunk)으로 분할합니다.
   - 각 청크에 대해 벡터 임베딩을 생성합니다.

2. **Extraction (추출)**
   - `src/rag/graph.ts`에 정의된 프롬프트를 사용하여 각 청크를 LLM에 전달합니다.
   - LLM은 텍스트 내에서 주요 개체(Entity)와 그들 간의 관계(Relationship)를 추론하여 구조화된 JSON 형태로 반환합니다.

3. **Storage (저장)**
   - 생성된 벡터 데이터는 로컬 인덱스 파일에 저장됩니다.
   - 추출된 개체와 관계 데이터는 `src/store/neo4jStore.ts`를 통해 Neo4j 그래프 데이터베이스에 노드(Node)와 엣지(Edge)로 저장됩니다.

4. **Retrieval (검색 및 하이브리드 컨텍스트 구성)**
   - 사용자가 Slack을 통해 질문을 입력하면 두 가지 검색이 동시에 수행됩니다.
     - **벡터 검색**: 질문과 의미적으로 유사한 문서 청크를 찾습니다.
     - **그래프 검색**: 질문에서 주요 키워드(개체)를 추출한 뒤, Neo4j에서 해당 개체와 1-hop(직접 연결된) 관계에 있는 하위 그래프(Subgraph) 정보를 조회합니다.
   - 두 검색 결과를 결합하여 풍부한 컨텍스트를 구성한 뒤 LLM에 전달하여 최종 답변을 생성합니다 (`src/rag/retrieve.ts`, `src/rag/answer.ts`).

## 아키텍처 다이어그램

```mermaid
flowchart TD
    subgraph Ingestion [데이터 인덱싱 파이프라인]
        A["문서 (PDF, TXT 등)"] --> B["청크 분할"]
        B --> C["벡터 임베딩 생성"]
        B --> D["LLM 개체/관계 추출 (graph.ts)"]
        C --> E["로컬 Vector Store (index.json)"]
        D --> F["Neo4j Graph DB (neo4jStore.ts)"]
    end

    subgraph Retrieval [하이브리드 검색 및 답변 파이프라인]
        G["사용자 질문 (Slack)"] --> H["벡터 유사도 검색"]
        G --> I["질문 내 개체 추출"]
        I --> J["Neo4j 하위 그래프 조회"]
        H --> K["통합 컨텍스트 구성"]
        J --> K
        K --> L["LLM 답변 생성 (answer.ts)"]
        L --> M["Slack 응답"]
    end
``` 특히 단순한 벡터 기반 검색을 넘어, 문서 내의 개체(Entity)와 관계(Relationship)를 파악하는 **Graph RAG(Graph Retrieval-Augmented Generation)** 기술을 적용하여 보다 깊이 있는 문맥 이해와 추론이 가능한 것이 특징입니다.

## 핵심 개념 (Core Concepts)

### 1. Ontology (온톨로지)
온톨로지는 지식 그래프를 구성하기 위한 뼈대이자 규칙(스키마)입니다. 어떤 종류의 개체(Person, Organization, Technology 등)들이 존재할 수 있고, 그들 사이에 어떤 관계(WORKS_FOR, USES, PART_OF 등)가 맺어질 수 있는지를 정의한 개념적 모델입니다. 본 프로젝트에서는 엄격한 사전 정의 대신, LLM 프롬프트를 통한 느슨한 온톨로지 가이드라인을 제공하여 유연성을 확보했습니다.

### 2. Graph RAG (Graph Retrieval-Augmented Generation)
기존의 RAG는 텍스트를 벡터로 변환하여 의미적 유사도만으로 문서를 검색합니다. 이는 "A는 B이다"와 같은 단순 정보 검색에는 유용하지만, "A가 속한 부서에서 사용하는 기술은 무엇인가?"와 같은 복합적인 관계 추론에는 한계가 있습니다. Graph RAG는 이러한 한계를 극복하기 위해 지식 그래프(Knowledge Graph)를 결합합니다. 문서에서 추출된 개체 간의 명시적인 관계망을 탐색하여, 벡터 검색이 놓칠 수 있는 숨겨진 문맥과 연결 고리를 LLM에게 제공합니다.

## 프로젝트 적용 방식 (Implementation Details)

### 개방형 정보 추출 (Open Information Extraction)
전문가가 수동으로 온톨로지 규칙을 정의하고 데이터를 입력하는 전통적인 방식 대신, 본 프로젝트는 LLM(Ollama)의 자연어 이해 능력을 활용합니다. 프롬프트 엔지니어링을 통해 문서를 읽고 스스로 개체와 관계를 동적으로 추출하여 지식 그래프를 구축합니다.

### 데이터 파이프라인 로직

1. **Ingest (인덱싱)**
   - 업로드된 문서들을 파싱하여 의미 있는 크기의 텍스트 조각(Chunk)으로 분할합니다.
   - 각 청크에 대해 벡터 임베딩을 생성합니다.

2. **Extraction (추출)**
   - `src/rag/graph.ts`에 정의된 프롬프트를 사용하여 각 청크를 LLM에 전달합니다.
   - LLM은 텍스트 내에서 주요 개체(Entity)와 그들 간의 관계(Relationship)를 추론하여 구조화된 JSON 형태로 반환합니다.

3. **Storage (저장)**
   - 생성된 벡터 데이터는 로컬 인덱스 파일에 저장됩니다.
   - 추출된 개체와 관계 데이터는 `src/store/neo4jStore.ts`를 통해 Neo4j 그래프 데이터베이스에 노드(Node)와 엣지(Edge)로 저장됩니다.

4. **Retrieval (검색 및 하이브리드 컨텍스트 구성)**
   - 사용자가 Slack을 통해 질문을 입력하면 두 가지 검색이 동시에 수행됩니다.
     - **벡터 검색**: 질문과 의미적으로 유사한 문서 청크를 찾습니다.
     - **그래프 검색**: 질문에서 주요 키워드(개체)를 추출한 뒤, Neo4j에서 해당 개체와 1-hop(직접 연결된) 관계에 있는 하위 그래프(Subgraph) 정보를 조회합니다.
   - 두 검색 결과를 결합하여 풍부한 컨텍스트를 구성한 뒤 LLM에 전달하여 최종 답변을 생성합니다 (`src/rag/retrieve.ts`, `src/rag/answer.ts`).

## 아키텍처 다이어그램

```mermaid
flowchart TD
    subgraph Ingestion [데이터 인덱싱 파이프라인]
        A["문서 (PDF, TXT 등)"] --> B["청크 분할"]
        B --> C["벡터 임베딩 생성"]
        B --> D["LLM 개체/관계 추출 (graph.ts)"]
        C --> E["로컬 Vector Store (index.json)"]
        D --> F["Neo4j Graph DB (neo4jStore.ts)"]
    end

    subgraph Retrieval [하이브리드 검색 및 답변 파이프라인]
        G["사용자 질문 (Slack)"] --> H["벡터 유사도 검색"]
        G --> I["질문 내 개체 추출"]
        I --> J["Neo4j 하위 그래프 조회"]
        H --> K["통합 컨텍스트 구성"]
        J --> K
        K --> L["LLM 답변 생성 (answer.ts)"]
        L --> M["Slack 응답"]
    end
```