import { Question, MCQQuestion, CodingQuestion } from '../../types';

export const dsaQuestions: Question[] = [
  {
    id: 'q_dsa_001',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'What is the time complexity of finding an element in a balanced Binary Search Tree (BST)?',
    options: [
      { id: 'A', text: 'O(1)' },
      { id: 'B', text: 'O(log n)' },
      { id: 'C', text: 'O(n)' },
      { id: 'D', text: 'O(n log n)' }
    ],
    correctOption: 'B',
    topic: 'Trees',
    subTopic: 'Binary Search Tree',
    difficulty: 'Easy',
    explanation: 'In a balanced BST, each step down the tree halves the search space, leading to a logarithmic time complexity O(log n).'
  },
  {
    id: 'q_dsa_002',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'Which sorting algorithm has the best average-case time complexity?',
    options: [
      { id: 'A', text: 'Bubble Sort' },
      { id: 'B', text: 'Insertion Sort' },
      { id: 'C', text: 'Merge Sort' },
      { id: 'D', text: 'Selection Sort' }
    ],
    correctOption: 'C',
    topic: 'Sorting',
    subTopic: 'Complexity',
    difficulty: 'Easy',
    explanation: 'Merge Sort consistently divides the array in half and merges sorted halves, guaranteeing an O(n log n) time complexity in all cases.'
  },
  {
    id: 'q_dsa_003',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'In a Hash Table, what is a collision?',
    options: [
      { id: 'A', text: 'When two different keys map to the same hash value (index).' },
      { id: 'B', text: 'When the hash table runs out of memory.' },
      { id: 'C', text: 'When a key is deleted while being read.' },
      { id: 'D', text: 'When a hash function returns a negative index.' }
    ],
    correctOption: 'A',
    topic: 'Hashing',
    subTopic: 'Concepts',
    difficulty: 'Easy',
    explanation: 'A collision occurs when a hash function maps two distinct keys to the same bucket or index in the hash table array.'
  },
  {
    id: 'q_dsa_004',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'Which data structure is typically used to implement Breadth-First Search (BFS) on a graph?',
    options: [
      { id: 'A', text: 'Stack' },
      { id: 'B', text: 'Queue' },
      { id: 'C', text: 'Priority Queue' },
      { id: 'D', text: 'Linked List' }
    ],
    correctOption: 'B',
    topic: 'Graphs',
    subTopic: 'BFS',
    difficulty: 'Easy',
    explanation: 'BFS explores the neighbor nodes first, level by level. A Queue (FIFO structure) is perfect for keeping track of the next nodes to visit.'
  },
  {
    id: 'q_dsa_005',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'What is the worst-case time complexity of Quick Sort?',
    options: [
      { id: 'A', text: 'O(n)' },
      { id: 'B', text: 'O(n log n)' },
      { id: 'C', text: 'O(n^2)' },
      { id: 'D', text: 'O(2^n)' }
    ],
    correctOption: 'C',
    topic: 'Sorting',
    subTopic: 'Quick Sort',
    difficulty: 'Medium',
    explanation: 'Quick Sort degrades to O(n^2) when the pivot selected is consistently the smallest or largest element (e.g., when the array is already sorted and the pivot is the first/last element).'
  },
  {
    id: 'q_dsa_006',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'Which algorithmic paradigm is Dijkstra\'s Shortest Path algorithm based on?',
    options: [
      { id: 'A', text: 'Divide and Conquer' },
      { id: 'B', text: 'Dynamic Programming' },
      { id: 'C', text: 'Greedy' },
      { id: 'D', text: 'Backtracking' }
    ],
    correctOption: 'C',
    topic: 'Graphs',
    subTopic: 'Shortest Path',
    difficulty: 'Medium',
    explanation: 'Dijkstra\'s algorithm is a greedy algorithm because it always selects the unvisited node with the smallest known distance from the starting node.'
  },
  {
    id: 'q_dsa_007',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'What characterizes Dynamic Programming (DP)?',
    options: [
      { id: 'A', text: 'It solves problems by making locally optimal choices at each step.' },
      { id: 'B', text: 'It solves overlapping subproblems and uses memoization or tabulation to store their results.' },
      { id: 'C', text: 'It explores all possible configurations recursively and abandons invalid ones.' },
      { id: 'D', text: 'It splits the array into two halves, solves them, and merges the results.' }
    ],
    correctOption: 'B',
    topic: 'Dynamic Programming',
    subTopic: 'Concepts',
    difficulty: 'Medium',
    explanation: 'DP is characterized by overlapping subproblems and optimal substructure. It optimizes recursion by caching the results of subproblems (memoization/tabulation).'
  },
  {
    id: 'q_dsa_008',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'How is a Priority Queue typically implemented to guarantee O(log n) insertions and extractions?',
    options: [
      { id: 'A', text: 'Sorted Array' },
      { id: 'B', text: 'Unsorted Linked List' },
      { id: 'C', text: 'Binary Heap' },
      { id: 'D', text: 'Hash Table' }
    ],
    correctOption: 'C',
    topic: 'Heap',
    subTopic: 'Priority Queue',
    difficulty: 'Medium',
    explanation: 'A Binary Heap allows O(log n) insertion and extraction of the max/min element, while O(1) time is needed to simply peek at the top element.'
  },
  {
    id: 'q_dsa_009',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'What is the time complexity of deleting a node from a singly linked list if you only have a pointer to the head node?',
    options: [
      { id: 'A', text: 'O(1)' },
      { id: 'B', text: 'O(log n)' },
      { id: 'C', text: 'O(n)' },
      { id: 'D', text: 'O(n^2)' }
    ],
    correctOption: 'C',
    topic: 'Linked Lists',
    subTopic: 'Operations',
    difficulty: 'Easy',
    explanation: 'To delete a specific node, you must traverse the list from the head to find the node and update its predecessor\'s pointer, taking O(n) time in the worst case.'
  },
  {
    id: 'q_dsa_010',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'What does the term "Backtracking" refer to?',
    options: [
      { id: 'A', text: 'Reversing the elements of an array' },
      { id: 'B', text: 'Systematically searching for a solution to a problem by trying partial solutions and abandoning them if they cannot be completed' },
      { id: 'C', text: 'Tracing a program\'s execution to find bugs' },
      { id: 'D', text: 'Traversing a tree from leaves to the root' }
    ],
    correctOption: 'B',
    topic: 'Backtracking',
    subTopic: 'Concepts',
    difficulty: 'Medium',
    explanation: 'Backtracking is an algorithmic technique for solving problems recursively by trying to build a solution incrementally, removing those solutions that fail to satisfy the constraints.'
  },
  {
    id: 'q_dsa_011',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'In a bitwise operation, what does `x ^ x` (x XOR x) evaluate to?',
    options: [
      { id: 'A', text: 'x' },
      { id: 'B', text: '1' },
      { id: 'C', text: '0' },
      { id: 'D', text: '2x' }
    ],
    correctOption: 'C',
    topic: 'Bit Manipulation',
    subTopic: 'Operations',
    difficulty: 'Easy',
    explanation: 'The XOR operation returns 1 only if the corresponding bits are different. Since `x` is identical to itself, all bits match, resulting in 0.'
  },
  {
    id: 'q_dsa_012',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'What is a topological sort?',
    options: [
      { id: 'A', text: 'Sorting an array of geographical coordinates.' },
      { id: 'B', text: 'A linear ordering of vertices in a Directed Acyclic Graph (DAG) such that for every directed edge u -> v, vertex u comes before v.' },
      { id: 'C', text: 'Sorting a tree based on its height.' },
      { id: 'D', text: 'Finding the shortest path in a graph with negative weights.' }
    ],
    correctOption: 'B',
    topic: 'Graphs',
    subTopic: 'Topological Sort',
    difficulty: 'Medium',
    explanation: 'Topological sorting is used to schedule tasks with dependencies. It is only possible on Directed Acyclic Graphs (DAGs).'
  },
  {
    id: 'q_dsa_013',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'Which operation is O(1) amortized time in a dynamically resizing array (like Python\'s list or C++ std::vector)?',
    options: [
      { id: 'A', text: 'Inserting an element at the beginning' },
      { id: 'B', text: 'Searching for an element' },
      { id: 'C', text: 'Appending an element to the end' },
      { id: 'D', text: 'Deleting an element from the middle' }
    ],
    correctOption: 'C',
    topic: 'Arrays',
    subTopic: 'Dynamic Arrays',
    difficulty: 'Medium',
    explanation: 'Appending at the end takes O(1) amortized time. Although it takes O(n) occasionally when the underlying array resizes, the average cost per operation over a sequence of inserts remains O(1).'
  },
  {
    id: 'q_dsa_014',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'What is the purpose of the "slow and fast pointer" technique in a linked list?',
    options: [
      { id: 'A', text: 'To sort the list' },
      { id: 'B', text: 'To detect cycles or find the middle of the list' },
      { id: 'C', text: 'To traverse the list backwards' },
      { id: 'D', text: 'To double the size of the list' }
    ],
    correctOption: 'B',
    topic: 'Linked Lists',
    subTopic: 'Techniques',
    difficulty: 'Easy',
    explanation: 'Floyd\'s Cycle-Finding Algorithm uses two pointers moving at different speeds. If there is a cycle, they will meet. It is also used to find the midpoint of a list.'
  },
  {
    id: 'q_dsa_015',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'How many edges does a tree with N nodes have?',
    options: [
      { id: 'A', text: 'N' },
      { id: 'B', text: 'N + 1' },
      { id: 'C', text: 'N - 1' },
      { id: 'D', text: 'log(N)' }
    ],
    correctOption: 'C',
    topic: 'Trees',
    subTopic: 'Properties',
    difficulty: 'Easy',
    explanation: 'A tree is a connected acyclic graph. By definition, a tree with N nodes must have exactly N - 1 edges.'
  },
  {
    id: 'q_dsa_016',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'Which traversal visits the root node, then the left subtree, and finally the right subtree?',
    options: [
      { id: 'A', text: 'Inorder' },
      { id: 'B', text: 'Preorder' },
      { id: 'C', text: 'Postorder' },
      { id: 'D', text: 'Level-order' }
    ],
    correctOption: 'B',
    topic: 'Trees',
    subTopic: 'Traversals',
    difficulty: 'Easy',
    explanation: 'In Preorder traversal, the order is Root -> Left -> Right. Inorder is Left -> Root -> Right. Postorder is Left -> Right -> Root.'
  },
  {
    id: 'q_dsa_017',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'What does the bitwise expression `x & (x - 1)` do?',
    options: [
      { id: 'A', text: 'Turns off the rightmost 1-bit in x' },
      { id: 'B', text: 'Turns on the rightmost 0-bit in x' },
      { id: 'C', text: 'Multiplies x by 2' },
      { id: 'D', text: 'Checks if x is negative' }
    ],
    correctOption: 'A',
    topic: 'Bit Manipulation',
    subTopic: 'Tricks',
    difficulty: 'Hard',
    explanation: 'Subtracting 1 from `x` flips all bits up to the rightmost 1-bit (including the 1-bit itself). Performing a bitwise AND with `x` clears that lowest set bit.'
  },
  {
    id: 'q_dsa_018',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'In a string searching context, what is the advantage of the Knuth-Morris-Pratt (KMP) algorithm over a naive search?',
    options: [
      { id: 'A', text: 'It requires O(1) auxiliary space.' },
      { id: 'B', text: 'It avoids re-evaluating characters in the text that have already been matched.' },
      { id: 'C', text: 'It hashes the pattern to compare integers instead of strings.' },
      { id: 'D', text: 'It starts searching from the end of the pattern.' }
    ],
    correctOption: 'B',
    topic: 'Strings',
    subTopic: 'Pattern Matching',
    difficulty: 'Medium',
    explanation: 'KMP precomputes an LPS (Longest Prefix Suffix) array to skip unnecessary character comparisons, achieving O(N+M) time complexity.'
  },
  {
    id: 'q_dsa_019',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'What is the space complexity of solving the Longest Common Subsequence (LCS) problem using a standard 2D DP table?',
    options: [
      { id: 'A', text: 'O(1)' },
      { id: 'B', text: 'O(N)' },
      { id: 'C', text: 'O(N * M)' },
      { id: 'D', text: 'O(N + M)' }
    ],
    correctOption: 'C',
    topic: 'Dynamic Programming',
    subTopic: 'Complexity',
    difficulty: 'Medium',
    explanation: 'A standard tabulation approach for LCS uses a 2D array of dimensions (N+1) x (M+1), resulting in O(N * M) space complexity.'
  },
  {
    id: 'q_dsa_020',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'When finding the shortest path in an unweighted graph, which algorithm is optimal?',
    options: [
      { id: 'A', text: 'Dijkstra\'s Algorithm' },
      { id: 'B', text: 'Bellman-Ford Algorithm' },
      { id: 'C', text: 'Depth-First Search (DFS)' },
      { id: 'D', text: 'Breadth-First Search (BFS)' }
    ],
    correctOption: 'D',
    topic: 'Graphs',
    subTopic: 'Algorithms',
    difficulty: 'Easy',
    explanation: 'BFS inherently explores an unweighted graph layer by layer, ensuring that the first time a node is visited, it has been reached via the shortest path.'
  },
  {
    id: 'q_dsa_021',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'What is a Trie data structure primarily used for?',
    options: [
      { id: 'A', text: 'Balancing binary search trees' },
      { id: 'B', text: 'Efficiently storing and retrieving keys that are strings (prefix matching)' },
      { id: 'C', text: 'Finding the shortest path in a graph' },
      { id: 'D', text: 'Implementing a priority queue' }
    ],
    correctOption: 'B',
    topic: 'Trees',
    subTopic: 'Trie',
    difficulty: 'Medium',
    explanation: 'A Trie (prefix tree) is a tree-like data structure that is particularly efficient for storing dictionaries, supporting autocomplete, and prefix-matching operations.'
  },
  {
    id: 'q_dsa_022',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'In algorithm analysis, what does Big-O notation formally describe?',
    options: [
      { id: 'A', text: 'The exact running time of an algorithm in seconds' },
      { id: 'B', text: 'An asymptotic upper bound on the time or space complexity of an algorithm' },
      { id: 'C', text: 'The minimum memory required to run the algorithm' },
      { id: 'D', text: 'The average-case performance' }
    ],
    correctOption: 'B',
    topic: 'Complexity',
    subTopic: 'Asymptotic Notation',
    difficulty: 'Easy',
    explanation: 'Big-O notation describes the worst-case scenario (upper bound) of the growth rate of a function as its input size approaches infinity.'
  },
  {
    id: 'q_dsa_023',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'Which graph algorithm can handle negative edge weights (provided there are no negative weight cycles)?',
    options: [
      { id: 'A', text: 'Dijkstra\'s Algorithm' },
      { id: 'B', text: 'Prim\'s Algorithm' },
      { id: 'C', text: 'Bellman-Ford Algorithm' },
      { id: 'D', text: 'Kruskal\'s Algorithm' }
    ],
    correctOption: 'C',
    topic: 'Graphs',
    subTopic: 'Algorithms',
    difficulty: 'Medium',
    explanation: 'Bellman-Ford computes shortest paths from a single source vertex to all other vertices. Unlike Dijkstra\'s algorithm, it correctly handles graphs with negative edge weights.'
  },
  {
    id: 'q_dsa_024',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'What is a "Monotonic Stack"?',
    options: [
      { id: 'A', text: 'A stack that only holds one data type.' },
      { id: 'B', text: 'A stack whose elements are strictly increasing or strictly decreasing.' },
      { id: 'C', text: 'A stack implemented using a linked list instead of an array.' },
      { id: 'D', text: 'A stack that limits its size to a predefined number.' }
    ],
    correctOption: 'B',
    topic: 'Stack',
    subTopic: 'Advanced Techniques',
    difficulty: 'Hard',
    explanation: 'A Monotonic Stack maintains its elements in a sorted order (increasing or decreasing). It is highly useful for problems like finding the "next greater element".'
  },
  {
    id: 'q_dsa_025',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'MCQ',
    questionText: 'Which data structure is best for detecting whether parentheses in a string are balanced?',
    options: [
      { id: 'A', text: 'Queue' },
      { id: 'B', text: 'Stack' },
      { id: 'C', text: 'Array' },
      { id: 'D', text: 'Hash Map' }
    ],
    correctOption: 'B',
    topic: 'Stack',
    subTopic: 'Applications',
    difficulty: 'Easy',
    explanation: 'A Stack is ideal for tracking open parentheses. As you iterate through the string, you push open brackets and pop when you encounter a matching closing bracket.'
  },
  {
    id: 'q_dsa_026',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'CODING',
    questionText: 'Two Sum',
    topic: 'Arrays',
    subTopic: 'Hash Map',
    difficulty: 'Medium',
    codingConfig: {
  "problemStatement": "Given an array of integers `nums` and an integer `target`, return the indices of the two numbers such that they add up to `target`.\\n\\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.\\n\\nReturn the answer as an array of two integers.",
  "inputFormat": "Line 1: A JSON array of integers `nums`.\\nLine 2: An integer `target`.",
  "outputFormat": "A JSON array of two integers representing the indices.",
  "constraints": [
    "2 <= nums.length <= 10^4",
    "-10^9 <= nums[i] <= 10^9",
    "-10^9 <= target <= 10^9"
  ],
  "examples": [
    {
      "input": "[2,7,11,15]\\n9",
      "output": "[0,1]",
      "explanation": "nums[0] + nums[1] == 9, we return [0, 1]."
    }
  ],
  "starterCode": {
    "javascript": "const fs = require('fs');\\n\\nfunction twoSum(nums, target) {\\n  // Write your code here\\n}\\n\\nfunction solve() {\\n  const input = fs.readFileSync(0, 'utf-8').trim().split('\\\n');\\n  if (input.length < 2) return;\\n  const nums = JSON.parse(input[0]);\\n  const target = JSON.parse(input[1]);\\n  console.log(JSON.stringify(twoSum(nums, target)));\\n}\\n\\nsolve();",
    "typescript": "import * as fs from 'fs';\\n\\nfunction twoSum(nums: number[], target: number): number[] {\\n  // Write your code here\\n  return [];\\n}\\n\\nfunction solve(): void {\\n  const input = fs.readFileSync(0, 'utf-8').trim().split('\\\n');\\n  if (input.length < 2) return;\\n  const nums = JSON.parse(input[0]);\\n  const target = JSON.parse(input[1]);\\n  console.log(JSON.stringify(twoSum(nums, target)));\\n}\\n\\nsolve();",
    "python": "import sys\\nimport json\\n\\ndef two_sum(nums, target):\\n    # Write your code here\\n    pass\\n\\ndef solve():\\n    input_data = sys.stdin.read().strip().split('\\\n')\\n    if len(input_data) < 2: return\\n    nums = json.loads(input_data[0])\\n    target = json.loads(input_data[1])\\n    print(json.dumps(two_sum(nums, target)).replace(' ', ''))\\n\\nif __name__ == '__main__':\\n    solve()"
  },
  "publicTests": [
    {
      "input": "[2,7,11,15]\\n9",
      "output": "[0,1]"
    },
    {
      "input": "[3,2,4]\\n6",
      "output": "[1,2]"
    },
    {
      "input": "[3,3]\\n6",
      "output": "[0,1]"
    }
  ],
  "hiddenTests": [
    {
      "input": "[1,5,9,12]\\n14",
      "output": "[1,2]"
    },
    {
      "input": "[-3,4,3,90]\\n0",
      "output": "[0,2]"
    },
    {
      "input": "[1000000000, -1000000000]\\n0",
      "output": "[0,1]"
    },
    {
      "input": "[2,5,5,11]\\n10",
      "output": "[1,2]"
    },
    {
      "input": "[0,4,3,0]\\n0",
      "output": "[0,3]"
    },
    {
      "input": "[10,20,30,40,50]\\n90",
      "output": "[3,4]"
    },
    {
      "input": "[-1,-2,-3,-4,-5]\\n-8",
      "output": "[2,4]"
    }
  ],
  "defaultLanguage": "javascript",
  "supportedLanguages": [
    "javascript",
    "typescript",
    "python"
  ],
  "timeLimitMs": 2000,
  "memoryLimitMb": 128
}
  },
  {
    id: 'q_dsa_027',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'CODING',
    questionText: 'Reverse Linked List',
    topic: 'Linked Lists',
    subTopic: 'Traversal',
    difficulty: 'Easy',
    codingConfig: {
  "problemStatement": "Given the head of a singly linked list, reverse the list, and return the reversed list. (Assume the input is provided as an array and you must return an array representing the reversed sequence).",
  "inputFormat": "Line 1: A JSON array of integers representing the linked list.",
  "outputFormat": "A JSON array of integers representing the reversed list.",
  "constraints": [
    "The number of nodes in the list is the range [0, 5000].",
    "-5000 <= Node.val <= 5000"
  ],
  "examples": [
    {
      "input": "[1,2,3,4,5]",
      "output": "[5,4,3,2,1]",
      "explanation": "The linked list is reversed."
    }
  ],
  "starterCode": {
    "javascript": "const fs = require('fs');\\n\\nfunction reverseList(head) {\\n  // Write your code here (array in, array out for simplicity)\\n}\\n\\nfunction solve() {\\n  const input = fs.readFileSync(0, 'utf-8').trim();\\n  if (!input) return;\\n  const head = JSON.parse(input);\\n  console.log(JSON.stringify(reverseList(head)));\\n}\\n\\nsolve();",
    "typescript": "import * as fs from 'fs';\\n\\nfunction reverseList(head: number[]): number[] {\\n  // Write your code here\\n  return [];\\n}\\n\\nfunction solve(): void {\\n  const input = fs.readFileSync(0, 'utf-8').trim();\\n  if (!input) return;\\n  const head = JSON.parse(input);\\n  console.log(JSON.stringify(reverseList(head)));\\n}\\n\\nsolve();",
    "python": "import sys\\nimport json\\n\\ndef reverse_list(head):\\n    # Write your code here\\n    pass\\n\\ndef solve():\\n    input_data = sys.stdin.read().strip()\\n    if not input_data: return\\n    head = json.loads(input_data)\\n    print(json.dumps(reverse_list(head)).replace(' ', ''))\\n\\nif __name__ == '__main__':\\n    solve()"
  },
  "publicTests": [
    {
      "input": "[1,2,3,4,5]",
      "output": "[5,4,3,2,1]"
    },
    {
      "input": "[1,2]",
      "output": "[2,1]"
    },
    {
      "input": "[]",
      "output": "[]"
    }
  ],
  "hiddenTests": [
    {
      "input": "[1]",
      "output": "[1]"
    },
    {
      "input": "[7,7,7,7]",
      "output": "[7,7,7,7]"
    },
    {
      "input": "[-1,-2,-3]",
      "output": "[-3,-2,-1]"
    },
    {
      "input": "[10,20,30,40,50,60,70,80,90,100]",
      "output": "[100,90,80,70,60,50,40,30,20,10]"
    },
    {
      "input": "[0,0]",
      "output": "[0,0]"
    }
  ],
  "defaultLanguage": "javascript",
  "supportedLanguages": [
    "javascript",
    "typescript",
    "python"
  ],
  "timeLimitMs": 2000,
  "memoryLimitMb": 128
}
  },
  {
    id: 'q_dsa_028',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'CODING',
    questionText: 'Longest Substring Without Repeating Characters',
    topic: 'Strings',
    subTopic: 'Hash Map',
    difficulty: 'Medium',
    codingConfig: {
  "problemStatement": "Given a string `s`, find the length of the longest substring without repeating characters.",
  "inputFormat": "Line 1: A single string `s`.",
  "outputFormat": "An integer representing the length.",
  "constraints": [
    "0 <= s.length <= 5 * 10^4",
    "`s` consists of English letters, digits, symbols and spaces."
  ],
  "examples": [
    {
      "input": "abcabcbb",
      "output": "3",
      "explanation": "The answer is 'abc', with the length of 3."
    }
  ],
  "starterCode": {
    "javascript": "const fs = require('fs');\\n\\nfunction lengthOfLongestSubstring(s) {\\n  // Write your code here\\n}\\n\\nfunction solve() {\\n  const input = fs.readFileSync(0, 'utf-8').replace(/\\r\\\n/g, '\\\n').replace(/\\\n$/, '');\\n  console.log(lengthOfLongestSubstring(input));\\n}\\n\\nsolve();",
    "typescript": "import * as fs from 'fs';\\n\\nfunction lengthOfLongestSubstring(s: string): number {\\n  // Write your code here\\n  return 0;\\n}\\n\\nfunction solve(): void {\\n  const input = fs.readFileSync(0, 'utf-8').replace(/\\r\\\n/g, '\\\n').replace(/\\\n$/, '');\\n  console.log(lengthOfLongestSubstring(input));\\n}\\n\\nsolve();",
    "python": "import sys\\n\\ndef length_of_longest_substring(s):\\n    # Write your code here\\n    pass\\n\\ndef solve():\\n    input_data = sys.stdin.read().replace('\\r\\\n', '\\\n')\\n    if input_data.endswith('\\\n'): input_data = input_data[:-1]\\n    print(length_of_longest_substring(input_data))\\n\\nif __name__ == '__main__':\\n    solve()"
  },
  "publicTests": [
    {
      "input": "abcabcbb",
      "output": "3"
    },
    {
      "input": "bbbbb",
      "output": "1"
    },
    {
      "input": "pwwkew",
      "output": "3"
    },
    {
      "input": "",
      "output": "0"
    }
  ],
  "hiddenTests": [
    {
      "input": " ",
      "output": "1"
    },
    {
      "input": "au",
      "output": "2"
    },
    {
      "input": "aab",
      "output": "2"
    },
    {
      "input": "dvdf",
      "output": "3"
    },
    {
      "input": "abcdefghijklmnopqrstuvwxyz",
      "output": "26"
    },
    {
      "input": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "output": "1"
    },
    {
      "input": "1234567890!@#$%^&*()_+",
      "output": "22"
    }
  ],
  "defaultLanguage": "javascript",
  "supportedLanguages": [
    "javascript",
    "typescript",
    "python"
  ],
  "timeLimitMs": 2000,
  "memoryLimitMb": 128
}
  },
  {
    id: 'q_dsa_029',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'CODING',
    questionText: 'Merge Two Sorted Lists',
    topic: 'Linked Lists',
    subTopic: 'Merge',
    difficulty: 'Easy',
    codingConfig: {
  "problemStatement": "You are given the heads of two sorted linked lists list1 and list2. Merge the two lists in a one sorted list. Return the head of the merged linked list. (Assume the inputs are provided as arrays and you must return an array representing the merged sequence).",
  "inputFormat": "Line 1: A JSON array of integers for list1.\\nLine 2: A JSON array of integers for list2.",
  "outputFormat": "A JSON array of integers representing the merged list.",
  "constraints": [
    "The number of nodes in both lists is in the range [0, 50]",
    "-100 <= Node.val <= 100",
    "Both list1 and list2 are sorted in non-decreasing order."
  ],
  "examples": [
    {
      "input": "[1,2,4]\\n[1,3,4]",
      "output": "[1,1,2,3,4,4]",
      "explanation": "Merged elements in order."
    }
  ],
  "starterCode": {
    "javascript": "const fs = require('fs');\\n\\nfunction mergeTwoLists(list1, list2) {\\n  // Write your code here\\n}\\n\\nfunction solve() {\\n  const input = fs.readFileSync(0, 'utf-8').trim().split('\\\n');\\n  if (input.length < 2) return;\\n  const list1 = JSON.parse(input[0]);\\n  const list2 = JSON.parse(input[1]);\\n  console.log(JSON.stringify(mergeTwoLists(list1, list2)));\\n}\\n\\nsolve();",
    "typescript": "import * as fs from 'fs';\\n\\nfunction mergeTwoLists(list1: number[], list2: number[]): number[] {\\n  // Write your code here\\n  return [];\\n}\\n\\nfunction solve(): void {\\n  const input = fs.readFileSync(0, 'utf-8').trim().split('\\\n');\\n  if (input.length < 2) return;\\n  const list1 = JSON.parse(input[0]);\\n  const list2 = JSON.parse(input[1]);\\n  console.log(JSON.stringify(mergeTwoLists(list1, list2)));\\n}\\n\\nsolve();",
    "python": "import sys\\nimport json\\n\\ndef merge_two_lists(list1, list2):\\n    # Write your code here\\n    pass\\n\\ndef solve():\\n    input_data = sys.stdin.read().strip().split('\\\n')\\n    if len(input_data) < 2: return\\n    list1 = json.loads(input_data[0])\\n    list2 = json.loads(input_data[1])\\n    print(json.dumps(merge_two_lists(list1, list2)).replace(' ', ''))\\n\\nif __name__ == '__main__':\\n    solve()"
  },
  "publicTests": [
    {
      "input": "[1,2,4]\\n[1,3,4]",
      "output": "[1,1,2,3,4,4]"
    },
    {
      "input": "[]\\n[]",
      "output": "[]"
    },
    {
      "input": "[]\\n[0]",
      "output": "[0]"
    }
  ],
  "hiddenTests": [
    {
      "input": "[2]\\n[1]",
      "output": "[1,2]"
    },
    {
      "input": "[-9,3]\\n[5,7]",
      "output": "[-9,3,5,7]"
    },
    {
      "input": "[-10,-10,-9,-4,1,6,6]\\n[-7,-2,1,1,4]",
      "output": "[-10,-10,-9,-7,-4,-2,1,1,1,4,6,6]"
    },
    {
      "input": "[5]\\n[1,2,4,6]",
      "output": "[1,2,4,5,6]"
    },
    {
      "input": "[100]\\n[-100]",
      "output": "[-100,100]"
    }
  ],
  "defaultLanguage": "javascript",
  "supportedLanguages": [
    "javascript",
    "typescript",
    "python"
  ],
  "timeLimitMs": 2000,
  "memoryLimitMb": 128
}
  },
  {
    id: 'q_dsa_030',
    testSeriesId: 'cat_coding_dsa',
    questionType: 'CODING',
    questionText: 'Maximum Depth of Binary Tree',
    topic: 'Trees',
    subTopic: 'Traversal',
    difficulty: 'Easy',
    codingConfig: {
  "problemStatement": "Given the root of a binary tree (represented as an array where `null` represents a missing node), return the maximum depth of the tree.",
  "inputFormat": "Line 1: A JSON array representing the level-order traversal of a binary tree.",
  "outputFormat": "An integer representing the depth.",
  "constraints": [
    "The number of nodes in the tree is in the range [0, 10^4].",
    "-100 <= Node.val <= 100"
  ],
  "examples": [
    {
      "input": "[3,9,20,null,null,15,7]",
      "output": "3",
      "explanation": "The longest path is 3 -> 20 -> 15 (or 7) which has 3 nodes."
    }
  ],
  "starterCode": {
    "javascript": "const fs = require('fs');\\n\\nfunction maxDepth(rootArray) {\\n  // Write your code here\\n}\\n\\nfunction solve() {\\n  const input = fs.readFileSync(0, 'utf-8').trim();\\n  if (!input) return;\\n  const root = JSON.parse(input);\\n  console.log(maxDepth(root));\\n}\\n\\nsolve();",
    "typescript": "import * as fs from 'fs';\\n\\nfunction maxDepth(rootArray: (number | null)[]): number {\\n  // Write your code here\\n  return 0;\\n}\\n\\nfunction solve(): void {\\n  const input = fs.readFileSync(0, 'utf-8').trim();\\n  if (!input) return;\\n  const root = JSON.parse(input);\\n  console.log(maxDepth(root));\\n}\\n\\nsolve();",
    "python": "import sys\\nimport json\\n\\ndef max_depth(root_array):\\n    # Write your code here\\n    pass\\n\\ndef solve():\\n    input_data = sys.stdin.read().strip()\\n    if not input_data: return\\n    root = json.loads(input_data)\\n    print(max_depth(root))\\n\\nif __name__ == '__main__':\\n    solve()"
  },
  "publicTests": [
    {
      "input": "[3,9,20,null,null,15,7]",
      "output": "3"
    },
    {
      "input": "[1,null,2]",
      "output": "2"
    },
    {
      "input": "[]",
      "output": "0"
    }
  ],
  "hiddenTests": [
    {
      "input": "[0]",
      "output": "1"
    },
    {
      "input": "[1,2,3,4,5,null,null]",
      "output": "3"
    },
    {
      "input": "[1,2,null,3,null,4,null,5,null]",
      "output": "5"
    },
    {
      "input": "[1,null,2,null,3,null,4,null,5]",
      "output": "5"
    },
    {
      "input": "[1,2,3,4,5,6,7,8,9,10]",
      "output": "4"
    }
  ],
  "defaultLanguage": "javascript",
  "supportedLanguages": [
    "javascript",
    "typescript",
    "python"
  ],
  "timeLimitMs": 2000,
  "memoryLimitMb": 128
}
  }
];
