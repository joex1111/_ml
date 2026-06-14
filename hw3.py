import torch
import torch.nn as nn
import torch.optim as optim

# 1. 定義資料集 (XOR 邏輯閘)
# 輸入為兩個二進位值，輸出為一個二進位值 (相同為 0，不同為 1)
X = torch.tensor([[0.0, 0.0], 
                  [0.0, 1.0], 
                  [1.0, 0.0], 
                  [1.0, 1.0]], dtype=torch.float32)

y = torch.tensor([[0.0], 
                  [1.0], 
                  [1.0], 
                  [0.0]], dtype=torch.float32)


# 2. 建立極簡的神經網路模型
class SimpleNN(nn.Module):
    def __init__(self):
        super(SimpleNN, self).__init__()
        # 隱藏層：輸入 2 個特徵，輸出 4 個特徵
        self.hidden = nn.Linear(2, 4)
        # 輸出層：輸入 4 個特徵，輸出 1 個值
        self.output = nn.Linear(4, 1)
        # 激活函數：使用 Sigmoid 將數值壓縮到 0~1 之間
        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        # 前向傳播流程：輸入 -> 隱藏層 -> Sigmoid -> 輸出層 -> Sigmoid
        x = self.sigmoid(self.hidden(x))
        x = self.sigmoid(self.output(x))
        return x

# 實例化模型
model = SimpleNN()

# 3. 定義損失函數與優化器
criterion = nn.BCELoss()  # 二元交叉熵損失 (Binary Cross Entropy)，適合 0/1 分類
optimizer = optim.SGD(model.parameters(), lr=0.1)  # 隨機梯度下降，學習率設為 0.1


# 4. 訓練模型
epochs = 5000  # 訓練疊代次數

print("開始訓練...")
for epoch in range(epochs):
    # 正向傳播：計算預測值
    predictions = model(X)
    
    # 計算損失值
    loss = criterion(predictions, y)
    
    # 反向傳播與優化
    optimizer.zero_grad()  # 清空上一步的殘留梯度
    loss.backward()        # 反向傳播，計算當前梯度
    optimizer.step()       # 更新權重
    
    # 每 1000 次列印一次日誌
    if (epoch + 1) % 1000 == 0:
        print(f"Epoch [{epoch+1}/{epochs}], Loss: {loss.item():.4f}")

print("訓練完成！\n")


# 5. 測試模型成果
print("--- 測試模型預測結果 ---")
with torch.no_grad():  # 測試階段不需要計算梯度
    test_outputs = model(X)
    # 將機率值轉換為 0 或 1 (大於 0.5 視為 1)
    predicted_classes = (test_outputs > 0.5).float()
    
    for i in range(len(X)):
        print(f"輸入: {X[i].tolist()} -> 預測機率: {test_outputs[i].item():.4f} -> 預測結果: {int(predicted_classes[i].item())} (真實標籤: {int(y[i].item())})")
