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

file=sys.argv[1]
def read_map(file):
    with open(file) as f:
        return [line.rstrip("\n") for line in f if line.strip()]          
grid=read_map(file)

def find(row, c):
    for row in range(len(grid)):
        col=grid[row].find(c)
        if col!=-1:
            return (row, col)
    return None
start=find(grid, 'S')
end=find(grid, "G")
MOVES={"N":(-1,0), "E":(0,1), "S":(1,0), "W":(0,-1)}
def bfs(start, end):
    visited={start:None}
    q=deque([start])
    while q:
        pos=q.popleft()
        if pos==end:
            break
        for dir,coor  in MOVES.items():
            x,y=pos[0]+coor[0], pos[1]+coor[1]
            if 0<=x<len(grid) and 0<=y<len(grid[0]) and grid[x][y]!='#' and (x,y) not in visited:
                visited[(x,y)]=(pos, dir)
                q.append((x,y))
    curr,d=visited[end]
    res=[]
    while curr!=start:
        res.append(d)
        curr,d=visited[curr]
    res.append(d)
    # print(f"G reached from : {visited[end]}")
    # print(f"No. of tiles reached: {len(visited)}")
    return res    
result=bfs(start, end)
print(''.join(reversed(result)))