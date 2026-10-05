# planner/plan.py — your robot's route planner (Stop 2).
#
# Run it from the top folder of your repo:
#     python3 planner/plan.py maps/office.txt
#
# Right now it only prints a placeholder. In Stop 2 you turn it into a real program:
# it reads the map file, finds the shortest route from S to G with BFS, and prints the moves
# (N, E, S, W). The walkthrough is in stops/02/WALKTHROUGH.md.
import sys
from collections import deque

def read_map(file):
    with open(file) as f:
        return [line.rstrip("\n") for line in f if line.strip()]          

def find(grid, c):
    for row in range(len(grid)):
        col = grid[row].find(c)
        if col != -1:
            return (row, col)
    return None

MOVES = {"N": (-1, 0), "E": (0, 1), "S": (1, 0), "W": (0, -1)}

def plan(grid):
    start = find(grid, 'S')
    end = find(grid, 'G')
    if start is None or end is None:
        raise ValueError("no route from S to G")
        
    visited = {start: None}
    q = deque([start])
    while q:
        pos = q.popleft()
        if pos == end:
            break
        for dir, coor in MOVES.items():
            x, y = pos[0] + coor[0], pos[1] + coor[1]
            if 0 <= x < len(grid) and 0 <= y < len(grid[0]) and grid[x][y] != '#' and (x, y) not in visited:
                visited[(x, y)] = (pos, dir)
                q.append((x, y))
                
    if end not in visited:
        return None
        
    curr, d = visited[end]
    res = []
    while curr != start:
        res.append(d)
        curr, d = visited[curr]
    res.append(d)
    res.reverse()  # Reverse the path so it goes from start to end
    route = ''.join(res)
    return route  

def main(argv):
    if len(argv) != 2:
        print("usage: python planner/plan.py <map file>", file=sys.stderr)
        return 2
    try:
        grid = read_map(argv[1])
    except FileNotFoundError:
        print(f"can't open {argv[1]}", file=sys.stderr)
        return 2
        
    try:
        route = plan(grid)
    except ValueError as err:
        print(err, file=sys.stderr)
        return 2

    if route is None:
        print("no route from S to G", file=sys.stderr)
        return 1
        
    print(route)
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv))
    
        
