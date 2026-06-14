import os
import math
import random
import urllib.request

# =============================================================================
# 1. 自動微分引擎 (Autograd Engine) - 這是模型的靈魂，代替了 PyTorch 的 Tensor
# =============================================================================
class Value:
    """ 儲存一個純量（單個數字）及其梯度，並能自動計算反向傳播 """
    def __init__(self, data, _children=(), _op=''):
        self.data = float(data)
        self.grad = 0.0          # 梯度，反向傳播時會被累積
        self._backward = lambda: None
        self._prev = set(_children)
        self._op = _op

    def __add__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data + other.data, (self, other), '+')
        def _backward():
            self.grad += out.grad
            other.grad += out.grad
        out._backward = _backward
        return out

    def __mul__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data * other.data, (self, other), '*')
        def _backward():
            self.grad += other.data * out.grad
            other.grad += self.data * out.grad
        out._backward = _backward
        return out

    def __pow__(self, other):
        assert isinstance(other, (int, float)), "目前只支援數值冪次"
        out = Value(self.data**other, (self,), f'**{other}')
        def _backward():
            self.grad += (other * (self.data ** (other - 1))) * out.grad
        out._backward = _backward
        return out

    def relu(self):
        out = Value(0.0 if self.data < 0 else self.data, (self,), 'ReLU')
        def _backward():
            self.grad += (1.0 if self.data > 0 else 0.0) * out.grad
        out._backward = _backward
        return out

    def exp(self):
        out = Value(math.exp(self.data), (self,), 'exp')
        def _backward():
            self.grad += out.data * out.grad
        out._backward = _backward
        return out

    def log(self):
        out = Value(math.log(self.data + 1e-15), (self,), 'log') # 加上 1e-15 防止 log(0)
        def _backward():
            self.grad += (1.0 / (self.data + 1e-15)) * out.grad
        out._backward = _backward
        return out

    def __radd__(self, other): return self.__add__(other)
    def __rmul__(self, other): return self.__mul__(other)
    def __sub__(self, other): return self + (-other)
    def __neg__(self): return self * -1
    def __truediv__(self, other): return self * (other**-1)

    def backward(self):
        """ 拓撲排序所有節點，並依序執行反向傳播 """
        topo = []
        visited = set()
        def build_topo(v):
            if v not in visited:
                visited.add(v)
                for child in v._prev:
                    build_topo(child)
                topo.append(v)
        build_topo(self)
        self.grad = 1.0
        for v in reversed(topo):
            v._backward()

# =============================================================================
# 2. 數據準備與 Tokenizer (字元級別)
# =============================================================================
# 下載 Karpathy 經典的 makemore 名字數據集
if not os.path.exists('input.txt'):
    print("正在下載數據集 (names.txt)...")
    names_url = 'https://raw.githubusercontent.com/karpathy/makemore/988aa59/names.txt'
    urllib.request.urlretrieve(names_url, 'input.txt')

docs = [line.strip() for line in open('input.txt', 'r') if line.strip()]
random.seed(42)
random.shuffle(docs)
print(f"數據集加載完成，共有 {len(docs)} 個名字。")

# 建立字元字典
uchars = sorted(set(''.join(docs)))
BOS = len(uchars)            # 特殊 Token：代表序列開始/結束 (BOS/EOS)
vocab_size = len(uchars) + 1 # 總詞彙量
stoi = {ch: i for i, ch in enumerate(uchars)}
itos = {i: ch for i, ch in enumerate(uchars)}
itos[BOS] = '.'              # 把 BOS 顯示為點，方便肉眼閱讀

def encode(s): return [stoi[c] for c in s]
def decode(l): return ''.join([itos[i] for i in l])

# =============================================================================
# 3. 超參數與權重初始化 (為了能在 CPU 純 Python 上跑，尺寸極小)
# =============================================================================
n_layer = 1      # Transformer 層數
n_embd = 8       # 嵌入維度 (Embedding Dimension)
n_head = 2       # 注意力頭數 (每頭維度 head_dim = 8 / 2 = 4)
block_size = 8   # 最大上下文長度 (Context Window)

# 定義一個用來初始化權重矩陣的輔助函式
def init_matrix(rows, cols, scale=0.1):
    return [[Value(random.uniform(-scale, scale)) for _ in range(cols)] for _ in range(rows)]

# 模型參數字典
params = {}
# Token 嵌入 (WTE) 與 位置嵌入 (WPE)
params['wte'] = init_matrix(vocab_size, n_embd)
params['wpe'] = init_matrix(block_size, n_embd)

# Transformer 層權重 (這裡只實作 1 層)
head_dim = n_embd // n_head
params['qkv'] = init_matrix(n_embd, 3 * n_embd) # 合併 Q, K, V 的投影矩陣
params['proj'] = init_matrix(n_embd, n_embd)    # 注意力輸出投影

# MLP 兩層線性層
params['mlp_w1'] = init_matrix(n_embd, 4 * n_embd)
params['mlp_w2'] = init_matrix(4 * n_embd, n_embd)

# 最後的 LayerNorm 縮放參數與輸出 Head
params['ln_g'] = [Value(1.0) for _ in range(n_embd)]
params['lm_head'] = init_matrix(n_embd, vocab_size)

# 收集所有參數供優化器使用
all_params = []
for k, v in params.items():
    if isinstance(v, list) and isinstance(v[0], list):
        for row in v: all_params.extend(row)
    else:
        all_params.extend(v)
print(f"GPT 模型初始化完成，總參數量: {len(all_params)}")

# =============================================================================
# 4. GPT 前向傳播 (Forward Pass)
# =============================================================================
def forward(token_ids):
    T = len(token_ids)
    assert T <= block_size, "輸入序列長度超過了 block_size"

    # 1. 讀取 Token 嵌入與位置嵌入並相加
    x = []
    for t in range(T):
        tok_emb = params['wte'][token_ids[t]]
        pos_emb = params['wpe'][t]
        x.append([t_e + p_e for t_e, p_e in zip(tok_emb, pos_emb)])

    # 2. Multi-Head Self-Attention (多頭自注意力機制帶有 Causal Mask)
    # 計算所有 Token 的 Q, K, V
    qkv_matrix = params['qkv']
    q_all, k_all, v_all = [], [], []
    for t in range(T):
        # 矩陣相乘 x[t] @ qkv_matrix
        qkv = [sum(x_i * w_i for x_i, w_i in zip(x[t], column)) for column in zip(*qkv_matrix)]
        q_all.append(qkv[0:n_embd])
        k_all.append(qkv[n_embd:2*n_embd])
        v_all.append(qkv[2*n_embd:3*n_embd])

    # 處理每一個注意力頭
    head_outputs = [[] for _ in range(T)]
    for h in range(n_head):
        hs, he = h * head_dim, (h + 1) * head_dim
        
        for i in range(T): # 當前的 query token
            q_h = q_all[i][hs:he]
            
            # 計算與過去所有 token (包括自己) 的注意力分數 (Causal Masking)
            scores = []
            for j in range(i + 1):
                k_h = k_all[j][hs:he]
                dot = sum(qi * ki for qi, ki in zip(q_h, k_h))
                scores.append(dot * (1.0 / math.sqrt(head_dim)))
            
            # 對注意力分數做 Softmax
            max_s = max(s.data for s in scores)
            exp_scores = [(s - max_s).exp() for s in scores]
            sum_exp = sum(exp_scores)
            probs = [e / sum_exp for e in exp_scores]
            
            # 加權求和 V
            out_v = [Value(0.0) for _ in range(head_dim)]
            for j, prob in enumerate(probs):
                v_h = v_all[j][hs:he]
                for d in range(head_dim):
                    out_v[d] = out_v[d] + prob * v_h[d]
            head_outputs[i].extend(out_v)

    # 注意力輸出後的線性投影與殘差連接 (Residual Connection)
    for t in range(T):
        attn_out = [sum(h_i * w_i for h_i, w_i in zip(head_outputs[t], col)) for col in zip(*params['proj'])]
        x[t] = [xi + ai for xi, ai in zip(x[t], attn_out)]

    # 3. MLP (Feed Forward Network) 與殘差連接
    for t in range(T):
        # 第一層 + ReLU
        h1 = [sum(xi * wi for xi, wi in zip(x[t], col)) for col in zip(*params['mlp_w1'])]
        h1_act = [h.relu() for h in h1]
        # 第二層
        h2 = [sum(hi * wi for hi, wi in zip(h1_act, col)) for col in zip(*params['mlp_w2'])]
        # 殘差連接
        x[t] = [xi + h2i for xi, h2i in zip(x[t], h2)]

    # 4. RMSNorm (MicroGPT 使用的簡化版 LayerNorm)
    for t in range(T):
        rms = (sum(xi**2 for xi in x[t]) * (1.0 / n_embd) + 1e-5)**0.5
        x[t] = [(xi / rms) * gi for xi, gi in zip(x[t], params['ln_g'])]

    # 5. LM Head (預測最後一個 Token 的機率 Logits)
    last_token_m = x[-1]
    logits = [sum(li * wi for li, wi in zip(last_token_m, col)) for col in zip(*params['lm_head'])]
    return logits

# =============================================================================
# 5. 優化器 (Adam) 與 訓練循環
# =============================================================================
# 初始化 Adam 的狀態變數
adam_m = [0.0] * len(all_params)
adam_v = [0.0] * len(all_params)

print("開始從零訓練 GPT (純 Python 標量計算速度較慢，請耐心等待)...")

for step in range(100): # 測試運行 100 步
    # 隨機挑選一個名字當作訓練樣本
    doc = random.choice(docs)
    tokens = [BOS] + encode(doc) + [BOS] # 前後加上邊界符
    
    loss_val = 0.0
    # 清空之前的梯度
    for p in all_params: p.grad = 0.0

    # 語言模型訓練：利用序列中的前文預測下一個字元
    for i in range(1, len(tokens)):
        context = tokens[:i]
        target = tokens[i]
        
        # 限制上下文不能長於模型窗口
        if len(context) > block_size: context = context[-block_size:]
        
        # 前向傳播拿到預測分數
        logits = forward(context)
        
        # 計算 Cross Entropy 損失函數
        max_l = max(l.data for l in logits)
        exp_logits = [(l - max_l).exp() for l in logits]
        sum_exp = sum(exp_logits)
        probs = [e / sum_exp for e in exp_logits]
        
        # 累積當前目標字元的損失負對數
        loss_val += -probs[target].log()

    # 計算平均損失並執行反向傳播
    total_loss = loss_val * (1.0 / (len(tokens) - 1))
    total_loss.backward()

    # Adam 優化器更新參數
    lr = 0.01
    beta1, beta2 = 0.9, 0.999
    for idx, p in enumerate(all_params):
        adam_m[idx] = beta1 * adam_m[idx] + (1 - beta1) * p.grad
        adam_v[idx] = beta2 * adam_v[idx] + (1 - beta2) * (p.grad ** 2)
        # 偏差修正 (Bias correction)
        m_hat = adam_m[idx] / (1.0 - beta1 ** (step + 1))
        v_hat = adam_v[idx] / (1.0 - beta2 ** (step + 1))
        # 參數更新
        p.data -= lr * m_hat / (v_hat ** 0.5 + 1e-8)

    if step % 10 == 0:
        print(f"Step {step:02d} | Loss: {total_loss.data:.4f}")

# =============================================================================
# 6. 推理與文本生成 (Inference Loop)
# =============================================================================
print("\n--- 訓練完成！開始展示 GPT 生成的「虛擬名字」 ---")

for _ in range(5):
    generated = []
    context = [BOS]
    
    while True:
        # 裁剪窗口
        ctx_input = context[-block_size:] if len(context) > block_size else context
        logits = forward(ctx_input)
        
        # 獲取機率分佈並進行採樣 (使用貪婪解碼或是基於機率採樣)
        # 為了簡化，此處使用加權採樣
        exp_logits = [math.exp(l.data - max(lk.data for lk in logits)) for l in logits]
        sum_exp = sum(exp_logits)
        probs = [e / sum_exp for e in exp_logits]
        
        # 隨機根據機率選擇下一個 Token
        next_token = random.choices(range(vocab_size), weights=probs, k=1)[0]
        
        if next_token == BOS or len(generated) > 15:
            break
        generated.append(next_token)
        context.append(next_token)
        
    print(f"生成名字: {decode(generated)}")
