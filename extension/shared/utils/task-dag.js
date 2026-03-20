/**
 * Task DAG (Directed Acyclic Graph) Manager
 * Handles complex task dependencies, conditional logic, and workflow orchestration
 */

class TaskDAG {
  constructor() {
    this.nodes = new Map(); // task_id -> TaskNode
    this.edges = new Map(); // task_id -> Set of dependent task_ids
    this.reverseEdges = new Map(); // task_id -> Set of prerequisite task_ids
    this.conditions = new Map(); // task_id -> Condition function
    this.workflows = new Map(); // workflow_id -> Workflow
  }

  /**
   * Add a task node to the DAG
   * @param {Object} taskNode - Task node definition
   * @param {string} taskNode.id - Unique task identifier
   * @param {Object} taskNode.task - Task definition
   * @param {Array} taskNode.dependencies - Array of prerequisite task IDs
   * @param {Function} taskNode.condition - Conditional execution function
   * @param {Object} taskNode.metadata - Additional metadata
   */
  addTaskNode(taskNode) {
    const { id, task, dependencies = [], condition = null, metadata = {} } = taskNode;

    // Create node
    const node = {
      id,
      task,
      dependencies: new Set(dependencies),
      condition,
      metadata,
      status: 'pending', // pending, ready, running, completed, failed, skipped
      result: null,
      error: null,
      startTime: null,
      endTime: null,
      retryCount: 0
    };

    this.nodes.set(id, node);
    this.edges.set(id, new Set());
    this.reverseEdges.set(id, new Set());

    // Add edges for dependencies
    for (const depId of dependencies) {
      if (!this.edges.has(depId)) {
        this.edges.set(depId, new Set());
      }
      if (!this.reverseEdges.has(depId)) {
        this.reverseEdges.set(depId, new Set());
      }
      
      this.edges.get(depId).add(id);
      this.reverseEdges.get(id).add(depId);
    }

    // Store condition if provided
    if (condition) {
      this.conditions.set(id, condition);
    }

    return node;
  }

  /**
   * Remove a task node from the DAG
   * @param {string} taskId - Task ID to remove
   * @returns {boolean} Success status
   */
  removeTaskNode(taskId) {
    const node = this.nodes.get(taskId);
    if (!node) return false;

    // Remove edges
    const dependents = this.edges.get(taskId) || new Set();
    const prerequisites = this.reverseEdges.get(taskId) || new Set();

    for (const dependent of dependents) {
      const reverseEdges = this.reverseEdges.get(dependent);
      if (reverseEdges) {
        reverseEdges.delete(taskId);
      }
    }

    for (const prerequisite of prerequisites) {
      const edges = this.edges.get(prerequisite);
      if (edges) {
        edges.delete(taskId);
      }
    }

    // Clean up maps
    this.nodes.delete(taskId);
    this.edges.delete(taskId);
    this.reverseEdges.delete(taskId);
    this.conditions.delete(taskId);

    return true;
  }

  /**
   * Get tasks that are ready to execute (all dependencies completed)
   * @returns {Array} Array of ready task nodes
   */
  getReadyTasks() {
    const readyTasks = [];

    for (const [id, node] of this.nodes) {
      if (node.status !== 'pending') continue;

      // Check if all dependencies are completed
      const prerequisites = this.reverseEdges.get(id) || new Set();
      let allDependenciesCompleted = true;

      for (const prereqId of prerequisites) {
        const prereqNode = this.nodes.get(prereqId);
        if (!prereqNode || prereqNode.status !== 'completed') {
          allDependenciesCompleted = false;
          break;
        }
      }

      if (allDependenciesCompleted) {
        readyTasks.push(node);
      }
    }

    return readyTasks;
  }

  /**
   * Evaluate conditional logic for a task
   * @param {string} taskId - Task ID to evaluate
   * @param {Object} context - Execution context with results from previous tasks
   * @returns {boolean} Whether task should execute
   */
  evaluateCondition(taskId, context = {}) {
    const condition = this.conditions.get(taskId);
    if (!condition) return true;

    try {
      return condition(context);
    } catch (error) {
      console.error(`Error evaluating condition for task ${taskId}:`, error);
      return false;
    }
  }

  /**
   * Get execution order (topological sort)
   * @returns {Array} Array of task IDs in execution order
   */
  getExecutionOrder() {
    const visited = new Set();
    const visiting = new Set();
    const order = [];

    const visit = (taskId) => {
      if (visiting.has(taskId)) {
        throw new Error(`Circular dependency detected involving task: ${taskId}`);
      }
      if (visited.has(taskId)) return;

      visiting.add(taskId);

      const prerequisites = this.reverseEdges.get(taskId) || new Set();
      for (const prereqId of prerequisites) {
        visit(prereqId);
      }

      visiting.delete(taskId);
      visited.add(taskId);
      order.push(taskId);
    };

    for (const taskId of this.nodes.keys()) {
      visit(taskId);
    }

    return order;
  }

  /**
   * Detect circular dependencies
   * @returns {Array} Array of circular dependency paths
   */
  detectCircularDependencies() {
    const visited = new Set();
    const visiting = new Set();
    const cycles = [];

    const visit = (taskId, path = []) => {
      if (visiting.has(taskId)) {
        const cycleStart = path.indexOf(taskId);
        cycles.push([...path.slice(cycleStart), taskId]);
        return;
      }
      if (visited.has(taskId)) return;

      visiting.add(taskId);
      path.push(taskId);

      const prerequisites = this.reverseEdges.get(taskId) || new Set();
      for (const prereqId of prerequisites) {
        visit(prereqId, [...path]);
      }

      visiting.delete(taskId);
      visited.add(taskId);
    };

    for (const taskId of this.nodes.keys()) {
      visit(taskId);
    }

    return cycles;
  }

  /**
   * Get task statistics
   * @returns {Object} Statistics about the DAG
   */
  getStatistics() {
    const stats = {
      totalTasks: this.nodes.size,
      byStatus: {
        pending: 0,
        ready: 0,
        running: 0,
        completed: 0,
        failed: 0,
        skipped: 0
      },
      totalDependencies: 0,
      maxDepth: 0,
      criticalPath: []
    };

    // Count by status
    for (const node of this.nodes.values()) {
      stats.byStatus[node.status]++;
      stats.totalDependencies += node.dependencies.size;
    }

    // Calculate max depth
    const depths = new Map();
    const calculateDepth = (taskId) => {
      if (depths.has(taskId)) return depths.get(taskId);

      const prerequisites = this.reverseEdges.get(taskId) || new Set();
      if (prerequisites.size === 0) {
        depths.set(taskId, 0);
        return 0;
      }

      let maxPrereqDepth = 0;
      for (const prereqId of prerequisites) {
        const prereqDepth = calculateDepth(prereqId);
        maxPrereqDepth = Math.max(maxPrereqDepth, prereqDepth);
      }

      const depth = maxPrereqDepth + 1;
      depths.set(taskId, depth);
      stats.maxDepth = Math.max(stats.maxDepth, depth);
      return depth;
    };

    for (const taskId of this.nodes.keys()) {
      calculateDepth(taskId);
    }

    // Find critical path (longest path)
    const criticalPathLengths = new Map();
    const calculateCriticalPath = (taskId) => {
      if (criticalPathLengths.has(taskId)) return criticalPathLengths.get(taskId);

      const dependents = this.edges.get(taskId) || new Set();
      if (dependents.size === 0) {
        criticalPathLengths.set(taskId, 0);
        return 0;
      }

      let maxDependentPath = 0;
      for (const depId of dependents) {
        const depPath = calculateCriticalPath(depId);
        maxDependentPath = Math.max(maxDependentPath, depPath);
      }

      const pathLength = maxDependentPath + 1;
      criticalPathLengths.set(taskId, pathLength);
      return pathLength;
    };

    let maxPathLength = 0;
    let criticalPathStart = null;
    for (const taskId of this.nodes.keys()) {
      const pathLength = calculateCriticalPath(taskId);
      if (pathLength > maxPathLength) {
        maxPathLength = pathLength;
        criticalPathStart = taskId;
      }
    }

    // Build critical path
    if (criticalPathStart) {
      let current = criticalPathStart;
      stats.criticalPath.push(current);
      
      while (true) {
        const dependents = this.edges.get(current) || new Set();
        let nextTask = null;
        let nextPathLength = -1;

        for (const depId of dependents) {
          if (criticalPathLengths.get(depId) === nextPathLength - 1) {
            nextTask = depId;
            nextPathLength = criticalPathLengths.get(depId);
          }
        }

        if (!nextTask) break;
        stats.criticalPath.push(nextTask);
        current = nextTask;
      }
    }

    return stats;
  }

  /**
   * Create a workflow template
   * @param {Object} workflow - Workflow definition
   * @returns {Object} Created workflow
   */
  createWorkflow(workflow) {
    const {
      id,
      name,
      description,
      tasks,
      variables = {},
      settings = {}
    } = workflow;

    const workflowObj = {
      id,
      name,
      description,
      tasks: new Map(),
      variables,
      settings,
      createdAt: Date.now(),
      executedCount: 0,
      lastExecuted: null
    };

    // Add tasks to workflow
    for (const taskConfig of tasks) {
      const taskNode = {
        ...taskConfig,
        id: `${workflow.id}_${taskConfig.id}`
      };
      workflowObj.tasks.set(taskNode.id, taskNode);
      this.addTaskNode(taskNode);
    }

    this.workflows.set(id, workflowObj);
    return workflowObj;
  }

  /**
   * Execute a workflow
   * @param {string} workflowId - Workflow ID to execute
   * @param {Object} variables - Runtime variables
   * @returns {Object} Execution result
   */
  async executeWorkflow(workflowId, variables = {}) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const execution = {
      id: crypto.randomUUID(),
      workflowId,
      startTime: Date.now(),
      endTime: null,
      status: 'running',
      results: new Map(),
      errors: [],
      variables: { ...workflow.variables, ...variables }
    };

    try {
      // Get execution order
      const executionOrder = this.getExecutionOrder()
        .filter(taskId => taskId.startsWith(`${workflowId}_`));

      // Execute tasks in order
      for (const taskId of executionOrder) {
        const node = this.nodes.get(taskId);
        if (!node) continue;

        // Check if task should be skipped due to conditions
        const context = {
          variables: execution.variables,
          results: Object.fromEntries(execution.results),
          workflow: execution
        };

        if (!this.evaluateCondition(taskId, context)) {
          node.status = 'skipped';
          continue;
        }

        // Mark task as running
        node.status = 'running';
        node.startTime = Date.now();

        try {
          // Execute task (this would be handled by the task scheduler)
          const result = await this.executeTask(node.task, context);
          
          node.status = 'completed';
          node.endTime = Date.now();
          node.result = result;
          execution.results.set(taskId, result);

        } catch (error) {
          node.status = 'failed';
          node.endTime = Date.now();
          node.error = error.message;
          execution.errors.push({ taskId, error: error.message });

          // Stop execution on failure if configured
          if (workflow.settings.stopOnFailure) {
            break;
          }
        }
      }

      execution.status = execution.errors.length > 0 ? 'failed' : 'completed';
      execution.endTime = Date.now();

      // Update workflow stats
      workflow.executedCount++;
      workflow.lastExecuted = execution.endTime;

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = Date.now();
      execution.errors.push({ error: error.message });
    }

    return execution;
  }

  /**
   * Execute a single task (placeholder - would be integrated with task scheduler)
   * @param {Object} task - Task definition
   * @param {Object} context - Execution context
   * @returns {Promise} Task result
   */
  async executeTask(task, context) {
    // This would be integrated with the Background Tasks Skill
    // For now, return a mock result
    return {
      success: true,
      data: `Task ${task.id} executed`,
      timestamp: Date.now()
    };
  }

  /**
   * Export DAG structure
   * @returns {Object} Serializable DAG structure
   */
  export() {
    const nodes = {};
    const edges = {};
    const conditions = {};

    for (const [id, node] of this.nodes) {
      nodes[id] = {
        id: node.id,
        task: node.task,
        dependencies: Array.from(node.dependencies),
        metadata: node.metadata,
        status: node.status
      };
    }

    for (const [fromId, toIds] of this.edges) {
      edges[fromId] = Array.from(toIds);
    }

    for (const [taskId, condition] of this.conditions) {
      conditions[taskId] = condition.toString();
    }

    return {
      nodes,
      edges,
      conditions,
      workflows: Array.from(this.workflows.entries()).map(([id, wf]) => ({
        id: wf.id,
        name: wf.name,
        description: wf.description,
        variables: wf.variables,
        settings: wf.settings,
        tasks: Array.from(wf.tasks.values())
      }))
    };
  }

  /**
   * Import DAG structure
   * @param {Object} data - Serialized DAG structure
   */
  import(data) {
    this.clear();

    // Import nodes
    for (const [id, nodeData] of Object.entries(data.nodes)) {
      this.addTaskNode(nodeData);
    }

    // Import workflows
    for (const workflowData of data.workflows) {
      this.workflows.set(workflowData.id, workflowData);
    }
  }

  /**
   * Clear all nodes and workflows
   */
  clear() {
    this.nodes.clear();
    this.edges.clear();
    this.reverseEdges.clear();
    this.conditions.clear();
    this.workflows.clear();
  }

  /**
   * Visualize the DAG structure (returns data for visualization)
   * @returns {Object} Visualization data
   */
  visualize() {
    const nodes = [];
    const edges = [];

    for (const [id, node] of this.nodes) {
      nodes.push({
        id,
        label: node.task.name || id,
        status: node.status,
        metadata: node.metadata
      });
    }

    for (const [fromId, toIds] of this.edges) {
      for (const toId of toIds) {
        edges.push({
          from: fromId,
          to: toId,
          type: 'dependency'
        });
      }
    }

    return { nodes, edges };
  }
}

export { TaskDAG };
