import numpy as np
import random

# 1. 設定隨機種子以確保結果可重現
np.random.seed(42)
random.seed(42)

# 2. 隨機產生城市座標 (假設有 10 個城市)
num_cities = 10
cities_coords = np.random.rand(num_cities, 2) * 100  # 100x100 的地圖

# 3. 計算計算兩城市間的歐幾里得距離
def calculate_distance(coord1, coord2):
    return np.sqrt(np.sum((coord1 - coord2) ** 2))

# 4. 評估函數：計算整條路徑的總距離（必須回到起點）
def total_tour_distance(tour, coords):
    distance = 0
    for i in range(len(tour)):
        city_a = tour[i]
        city_b = tour[(i + 1) % len(tour)] # 下一個城市，最後一個會連回第一個
        distance += calculate_distance(coords[city_a], coords[city_b])
    return distance

# 5. 爬山演算法主程式
def hill_climbing_tsp(coords):
    num_cities = len(coords)
    
    # 步驟 A: 建立一個隨機的初始解 (例如: [0, 3, 1, 4, 2])
    current_tour = list(range(num_cities))
    random.shuffle(current_tour)
    current_distance = total_tour_distance(current_tour, coords)
    
    print(f"初始隨機路徑總距離: {current_distance:.2f}")
    
    improved = True
    while improved:
        improved = False
        best_neighbor_tour = None
        best_neighbor_distance = current_distance
        
        # 步驟 B: 產生所有可能的鄰居（透過兩點交換 2-opt）
        for i in range(num_cities):
            for j in range(i + 1, num_cities):
                # 複製當前路徑並交換 i 和 j 兩個城市
                neighbor_tour = current_tour.copy()
                neighbor_tour[i], neighbor_tour[j] = neighbor_tour[j], neighbor_tour[i]
                
                # 計算鄰居的距離
                neighbor_distance = total_tour_distance(neighbor_tour, coords)
                
                # 如果鄰居比目前看過最好的還要短，暫存起來
                if neighbor_distance < best_neighbor_distance:
                    best_neighbor_distance = neighbor_distance
                    best_neighbor_tour = neighbor_tour
        
        # 步驟 C: 如果找到更好的鄰居，就「往上爬」（更新目前狀態）
        if best_neighbor_tour is not None:
            current_tour = best_neighbor_tour
            current_distance = best_neighbor_distance
            improved = True # 允許繼續下一輪搜尋
            
    return current_tour, current_distance

# 執行演算法
best_tour, min_distance = hill_climbing_tsp(cities_coords)

print("\n--- 最佳化結果 ---")
print(f"最優路徑順序: {best_tour}")
print(f"最優路徑總距離: {min_distance:.2f}")
