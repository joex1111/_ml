import torch
import torch.nn as nn
import numpy as np

# ==========================================
# 1. 資料預處理 (Data Preprocessing)
# ==========================================
# 準備一段訓練文本（你可以換成任何你想讓它學的文章）
text = """
人工智慧正在改變世界。深度學習是人工智慧的一個重要分支。
除了 Transformer 之外，經典的循環神經網路 LSTM 也能用來處理序列資料。
今天我們就用 PyTorch 來寫一個非 Attention 的語言模型吧！
"""

# 建立字元映射表 (Character-level vocab)
chars = sorted(list(set(text)))
vocab_size = len(chars)
char_to_ix = {ch: i for i, ch in enumerate(chars)}
ix_to_char = {i: ch for i, ch in enumerate(chars)}

# 將文本轉換成數字編碼
data = [char_to_ix[ch] for ch in text]

# 超參數設定
seq_length = 10  # 每次輸入模型的句子長度
batch_size = 1
embedding_dim = 64
hidden_dim = 128
epochs = 200
lr = 0.01

# 建立訓練資料集 (X 是前 N 個字，Y 是 X 向後平移一個字的預測目標)
X_train = []
Y_train = []
for i in range(len(data) - seq_length):
    X_train.append(data[i:i+seq_length])
    Y_train.append(data[i+1:i+seq_length+1])

X_train = torch.tensor(X_train, dtype=torch.long)
Y_train = torch.tensor(Y_train, dtype=torch.long)

# ==========================================
# 2. 定義非 Transformer 模型 (LSTM Language Model)
# ==========================================
class LSTMLanguageModel(nn.Module):
    def __init__(self, vocab_size, embedding_dim, hidden_dim):
        super(LSTMLanguageModel, self).__init__()
        self.hidden_dim = hidden_dim
        # 詞嵌入層
        self.embedding = nn.Embedding(vocab_size, embedding_dim)
        # 核心：LSTM 層（非 Attention）
        self.lstm = nn.LSTM(embedding_dim, hidden_dim, batch_first=True)
        # 輸出層：預測下一個字的機率
        self.linear = nn.Linear(hidden_dim, vocab_size)
        
    def forward(self, x, hidden=None):
        # x shape: (batch_size, seq_length)
        embeds = self.embedding(x)  # shape: (batch_size, seq_length, embedding_dim)
        
        # lstm_out shape: (batch_size, seq_length, hidden_dim)
        lstm_out, hidden = self.lstm(embeds, hidden)
        
        # 映射到字表大小
        output = self.linear(lstm_out)  # shape: (batch_size, seq_length, vocab_size)
        return output, hidden

# 宣告模型、損失函數與優化器
model = LSTMLanguageModel(vocab_size, embedding_dim, hidden_dim)
criterion = nn.CrossEntropyLoss()
optimizer = torch.optim.Adam(model.parameters(), lr=lr)

# ==========================================
# 3. 模型訓練 (Training)
# ==========================================
print("開始訓練模型...")
for epoch in range(epochs):
    model.train()
    total_loss = 0
    
    # 這裡為了簡化，採用逐個序列訓練（可視為 batch_size=1）
    for i in range(X_train.size(0)):
        x = X_train[i].unsqueeze(0)  # 增加 batch 維度 -> (1, seq_length)
        y = Y_train[i].unsqueeze(0)  # (1, seq_length)
        
        optimizer.zero_grad()
        
        # 前向傳播
        output, _ = model(x)
        
        # 計算損失 (需要把維度攤平以符合 CrossEntropyLoss 的要求)
        loss = criterion(output.view(-1, vocab_size), y.view(-1))
        loss.backward()
        optimizer.step()
        
        total_loss += loss.item()
        
    if (epoch + 1) % 40 == 0:
        print(f"Epoch [{epoch+1}/{epochs}], Loss: {total_loss/X_train.size(0):.4f}")

# ==========================================
# 4. 文本生成 (Text Generation / Inference)
# ==========================================
def generate_text(model, start_str, gen_length=30):
    model.eval()
    with torch.no_grad():
        # 將起始字串轉換成 ID
        current_seq = [char_to_ix[ch] for ch in start_str if ch in char_to_ix]
        if not current_seq:
            current_seq = [0] # 預防輸入不在字表內的字
            
        result = start_str
        hidden = None
        
        # 逐步預測接下來的字
        for _ in range(gen_length):
            x = torch.tensor([current_seq], dtype=torch.long)
            output, hidden = model(x, hidden)
            
            # 取出最後一個時間步的預測結果
            next_token_logits = output[0, -1, :]
            # 使用 softmax 轉成機率，並進行隨機採樣（增加生成多樣性）
            probs = torch.softmax(next_token_logits, dim=-1).numpy()
            next_char_id = np.random.choice(len(probs), p=probs)
            
            # 串接生成結果
            result += ix_to_char[next_char_id]
            
            # 更新下一次的輸入（維持滑動視窗或只單純輸入最後一個字，搭配 hidden state）
            current_seq = [next_char_id]
            
        return result

print("\n--- 模型生成文字測試 ---")
print(generate_text(model, start_str="人工智慧", gen_length=25))
