/**
 * SuyaNet — Demo
 * Trains on three tasks to prove correctness:
 *   1. XOR problem (non-linear classification)
 *   2. Iris-style multi-class classification
 *   3. SRM knowledge graph link prediction
 */

const { Matrix } = require('./matrix');
const { NeuralNetwork } = require('./network');
const { Adam } = require('./optimizer');
const { SRM } = require('./srm');

// ═══════════════════════════════════════════════════════════════
//  DEMO 1: XOR — proves non-linear learning works
// ═══════════════════════════════════════════════════════════════

function demoXOR() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  DEMO 1: XOR Problem (Non-Linear Learning)  ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // XOR data: 2 inputs, 1 output
  // Each column is one sample
  const X = Matrix.fromArray([
    [0, 0, 1, 1],
    [0, 1, 0, 1]
  ]);
  const Y = Matrix.fromArray([
    [0, 1, 1, 0]
  ]);

  // Network: 2 → 8 → 1
  const net = new NeuralNetwork([
    { size: 2 },
    { size: 8, activation: 'relu' },
    { size: 1, activation: 'sigmoid' }
  ]);

  const optimizer = new Adam(net.layers, { lr: 0.01 });

  console.log(`Parameters: ${net.paramCount()}`);
  console.log('Training...\n');

  for (let epoch = 0; epoch <= 2000; epoch++) {
    // Forward
    const Yhat = net.forward(X);
    const loss = net.computeLoss(Yhat, Y, 'binaryCrossEntropy');

    // Backward
    const dA = net.computeLossGradient(Yhat, Y, 'binaryCrossEntropy');
    net.backward(dA);
    optimizer.step();

    if (epoch % 500 === 0) {
      const preds = Yhat.toArray()[0].map(v => v.toFixed(4));
      console.log(`  Epoch ${String(epoch).padStart(4)}: loss=${loss.toFixed(6)}  preds=[${preds.join(', ')}]`);
    }
  }

  // Final predictions
  const finalPreds = net.forward(X);
  const rounded = finalPreds.toArray()[0].map(v => Math.round(v));
  const expected = [0, 1, 1, 0];
  const correct = rounded.every((v, i) => v === expected[i]);
  console.log(`\n  Final: [${rounded.join(', ')}]  Expected: [${expected.join(', ')}]  ${correct ? '✓ PASS' : '✗ FAIL'}`);
  return correct;
}


// ═══════════════════════════════════════════════════════════════
//  DEMO 2: Multi-class classification (synthetic Iris-like)
// ═══════════════════════════════════════════════════════════════

function demoClassification() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  DEMO 2: 3-Class Classification             ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Generate synthetic 3-class data (4 features, 3 classes, 60 samples)
  const numPerClass = 20;
  const features = 4;
  const classes = 3;
  const m = numPerClass * classes;

  const Xdata = new Float64Array(features * m);
  const Ydata = new Float64Array(classes * m);

  // Class centers
  const centers = [
    [1, 0, -1, 0.5],
    [-1, 1, 0, -0.5],
    [0, -1, 1, 0]
  ];

  for (let c = 0; c < classes; c++) {
    for (let s = 0; s < numPerClass; s++) {
      const col = c * numPerClass + s;
      for (let f = 0; f < features; f++) {
        Xdata[f * m + col] = centers[c][f] + (Math.random() - 0.5) * 0.8;
      }
      // One-hot label
      Ydata[c * m + col] = 1;
    }
  }

  const X = new Matrix(features, m, Xdata);
  const Y = new Matrix(classes, m, Ydata);

  // Network: 4 → 16 → 8 → 3
  const net = new NeuralNetwork([
    { size: 4 },
    { size: 16, activation: 'relu' },
    { size: 8, activation: 'relu' },
    { size: 3, activation: 'softmax' }
  ]);

  const optimizer = new Adam(net.layers, { lr: 0.005 });

  console.log(`Parameters: ${net.paramCount()}`);
  console.log(`Samples: ${m} (${numPerClass} per class)`);
  console.log('Training...\n');

  for (let epoch = 0; epoch <= 500; epoch++) {
    const Yhat = net.forward(X);
    const loss = net.computeLoss(Yhat, Y, 'categoricalCrossEntropy');

    const dA = net.computeLossGradient(Yhat, Y, 'categoricalCrossEntropy');
    net.backward(dA);
    optimizer.step();

    if (epoch % 100 === 0) {
      const acc = net.accuracy(Yhat, Y);
      console.log(`  Epoch ${String(epoch).padStart(4)}: loss=${loss.toFixed(6)}  accuracy=${(acc * 100).toFixed(1)}%`);
    }
  }

  const finalYhat = net.forward(X);
  const finalAcc = net.accuracy(finalYhat, Y);
  const pass = finalAcc > 0.9;
  console.log(`\n  Final accuracy: ${(finalAcc * 100).toFixed(1)}%  ${pass ? '✓ PASS' : '✗ FAIL'}`);
  return pass;
}


// ═══════════════════════════════════════════════════════════════
//  DEMO 3: SRM — Knowledge Graph Link Prediction
// ═══════════════════════════════════════════════════════════════

function demoSRM() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  DEMO 3: SRM Knowledge Graph Reasoning      ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Simple knowledge graph:
  // Entities: 0=Alice, 1=Bob, 2=Carol, 3=Dave, 4=CompanyX, 5=CompanyY
  // Relations: 0=worksAt, 1=friendOf, 2=manages
  const entityNames = ['Alice', 'Bob', 'Carol', 'Dave', 'CompanyX', 'CompanyY'];
  const relationNames = ['worksAt', 'friendOf', 'manages'];

  const srm = new SRM(6, 3, 16, { margin: 1.0, lr: 0.01 });

  // Known facts (positive triples)
  const triples = [
    [0, 0, 4], // Alice worksAt CompanyX
    [1, 0, 4], // Bob worksAt CompanyX
    [2, 0, 5], // Carol worksAt CompanyY
    [3, 0, 5], // Dave worksAt CompanyY
    [0, 1, 1], // Alice friendOf Bob
    [2, 1, 3], // Carol friendOf Dave
    [0, 2, 1], // Alice manages Bob
    [2, 2, 3], // Carol manages Dave
  ];

  console.log('Knowledge graph:');
  for (const [h, r, t] of triples) {
    console.log(`  ${entityNames[h]} --${relationNames[r]}--> ${entityNames[t]}`);
  }
  console.log('\nTraining SRM...\n');

  for (let epoch = 0; epoch <= 300; epoch++) {
    // Shuffle triples each epoch
    const shuffled = [...triples].sort(() => Math.random() - 0.5);
    const loss = srm.trainBatch(shuffled);

    if (epoch % 75 === 0) {
      console.log(`  Epoch ${String(epoch).padStart(4)}: loss=${loss.toFixed(6)}`);
    }
  }

  // Test: who does Alice work at?
  console.log('\nLink Prediction Tests:');

  const test1 = srm.predictTail(0, 0, 3); // Alice worksAt ?
  console.log(`\n  Alice worksAt ? →`);
  for (const { entity, score } of test1) {
    console.log(`    ${entityNames[entity].padEnd(10)} score=${score.toFixed(4)}`);
  }
  const aliceWorksAtX = test1[0].entity === 4;

  const test2 = srm.predictTail(0, 1, 3); // Alice friendOf ?
  console.log(`\n  Alice friendOf ? →`);
  for (const { entity, score } of test2) {
    console.log(`    ${entityNames[entity].padEnd(10)} score=${score.toFixed(4)}`);
  }
  const aliceFriendBob = test2[0].entity === 1;

  console.log(`\n  Alice worksAt CompanyX? ${aliceWorksAtX ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`  Alice friendOf Bob? ${aliceFriendBob ? '✓ PASS' : '✗ FAIL'}`);

  return aliceWorksAtX && aliceFriendBob;
}


// ═══════════════════════════════════════════════════════════════
//  DEMO 4: Hybrid — SRM embeddings fed into Neural Network
// ═══════════════════════════════════════════════════════════════

function demoHybrid() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  DEMO 4: Hybrid SRM + Neural Network        ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Train SRM first
  const srm = new SRM(6, 3, 8, { margin: 1.0, lr: 0.02 });
  const triples = [
    [0, 0, 4], [1, 0, 4], [2, 0, 5], [3, 0, 5],
    [0, 1, 1], [2, 1, 3], [0, 2, 1], [2, 2, 3],
  ];

  for (let epoch = 0; epoch < 200; epoch++) {
    srm.trainBatch([...triples].sort(() => Math.random() - 0.5));
  }

  // Use SRM embeddings as features for a NN classifier
  // Task: predict which company (0=CompanyX, 1=CompanyY) an entity works at
  const entities = [0, 1, 2, 3]; // Alice, Bob, Carol, Dave
  const labels = [0, 0, 1, 1];   // CompanyX, CompanyX, CompanyY, CompanyY

  // Get embeddings from SRM
  const X = srm.getEmbeddingsForNN(entities); // (8 × 4)

  // One-hot labels (2 × 4)
  const Y = Matrix.zeros(2, 4);
  for (let i = 0; i < labels.length; i++) {
    Y.set(labels[i], i, 1);
  }

  // Small classifier: 8 → 8 → 2
  const net = new NeuralNetwork([
    { size: 8 },
    { size: 8, activation: 'relu' },
    { size: 2, activation: 'softmax' }
  ]);

  const optimizer = new Adam(net.layers, { lr: 0.01 });

  console.log('SRM embeddings → Neural Network classifier');
  console.log(`Input: entity embeddings (dim=${srm.dim}), Output: company prediction`);
  console.log('Training...\n');

  for (let epoch = 0; epoch <= 300; epoch++) {
    const Yhat = net.forward(X);
    const loss = net.computeLoss(Yhat, Y, 'categoricalCrossEntropy');
    const dA = net.computeLossGradient(Yhat, Y, 'categoricalCrossEntropy');
    net.backward(dA);
    optimizer.step();

    if (epoch % 75 === 0) {
      const acc = net.accuracy(Yhat, Y);
      console.log(`  Epoch ${String(epoch).padStart(4)}: loss=${loss.toFixed(6)}  accuracy=${(acc * 100).toFixed(1)}%`);
    }
  }

  const finalYhat = net.forward(X);
  const finalAcc = net.accuracy(finalYhat, Y);
  const pass = finalAcc === 1.0;
  console.log(`\n  Final accuracy: ${(finalAcc * 100).toFixed(1)}%  ${pass ? '✓ PASS' : '✗ FAIL'}`);
  return pass;
}


// ═══════════════════════════════════════════════════════════════
//  RUN ALL DEMOS
// ═══════════════════════════════════════════════════════════════

console.log('');
console.log('  ███████╗██╗   ██╗██╗   ██╗ █████╗ ███╗   ██╗███████╗████████╗');
console.log('  ██╔════╝██║   ██║╚██╗ ██╔╝██╔══██╗████╗  ██║██╔════╝╚══██╔══╝');
console.log('  ███████╗██║   ██║ ╚████╔╝ ███████║██╔██╗ ██║█████╗     ██║   ');
console.log('  ╚════██║██║   ██║  ╚██╔╝  ██╔══██║██║╚██╗██║██╔══╝     ██║   ');
console.log('  ███████║╚██████╔╝   ██║   ██║  ██║██║ ╚████║███████╗   ██║   ');
console.log('  ╚══════╝ ╚═════╝    ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝   ╚═╝   ');
console.log('  Raw Matrix AI — No Frameworks, No Dependencies');
console.log('');

const results = [];
results.push(['XOR', demoXOR()]);
results.push(['Classification', demoClassification()]);
results.push(['SRM', demoSRM()]);
results.push(['Hybrid', demoHybrid()]);

console.log('\n╔══════════════════════════════════════════════╗');
console.log('║  RESULTS SUMMARY                            ║');
console.log('╠══════════════════════════════════════════════╣');
for (const [name, pass] of results) {
  console.log(`║  ${name.padEnd(20)} ${pass ? '✓ PASS' : '✗ FAIL'}                  ║`);
}
console.log('╚══════════════════════════════════════════════╝');
