import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

interface Submission {
    source_code: string;
    language_id: number;
    problem_id: string;
    callback_url?: string;
    timeout?: number;
    memory_limit?: number;
}

// Sample code snippets that don't require stdin
const codeSamples: Record<number, string[]> = {
    71: [ // Python
        `print('Hello, World!')`,
        `for i in range(5):\n    print(i)`,
        `x = 10\ny = 20\nprint(x + y)`,
    ],
    63: [ // JavaScript (Node.js)
        `console.log('Hello, World!');`,
        `for (let i = 0; i < 5; i++) {\n    console.log(i);\n}`,
        `let a = 5; let b = 10; console.log(a + b);`,
    ],
    50: [ // C
        `#include <stdio.h>\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}`,
        `#include <stdio.h>\nint main() {\n    for (int i = 0; i < 5; i++) {\n        printf("%d\\n", i);\n    }\n    return 0;\n}`,
        `#include <stdio.h>\nint main() {\n    int a = 5, b = 10;\n    printf("%d\\n", a + b);\n    return 0;\n}`,
    ],
    // Exclude Java (62) for now since javac isn't installed
};

// Function to generate a random submission without stdin
function generateRandomSubmission(): Submission {
    const languageIds = [71, 63, 50]; // No Java (62) for now
    const language_id = languageIds[Math.floor(Math.random() * languageIds.length)];
    const source_code = codeSamples[language_id][Math.floor(Math.random() * codeSamples[language_id].length)];
    const problem_id = `prob-${uuidv4().slice(0, 8)}`;

    return {
        source_code,
        language_id,
        problem_id,
        callback_url: 'http://localhost:3001/callback', // Point to webhook server
        timeout: 10000,
        memory_limit: 512,
    };
}

// Function to send submissions to /submit/batch
async function seedSubmissions(count: number = 5) {
    const submissions: Submission[] = Array.from({ length: count }, () => generateRandomSubmission());

    try {
        console.log('Sending submissions:', JSON.stringify(submissions, null, 2));
        const response = await axios.post('http://localhost:3000/submit/batch', { submissions }, {
            headers: { 'Content-Type': 'application/json' },
        });
        console.log('Response:', response.data);
    } catch (error: any) {
        console.error('Error submitting batch:', error.response?.data || error.message);
    }
}

// Run the seeding
seedSubmissions(45);