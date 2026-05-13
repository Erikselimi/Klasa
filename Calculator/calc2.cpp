#include <iostream>

int main() {
    double a = 0.0;
    double b = 0.0;
    char op = '+';
    std::cout << "Simple calculator\n";
    std::cout << "Enter an expression like: 3 + 4\n";
    std::cout << "Supported operators: + - * /\n";
    std::cout << "Type q to quit.\n\n";

    while (true) {
        std::cout << "Enter calculation: ";

        if (!(std::cin >> a)) {
            // If the user types q or any non-number first, stop the program.
            std::cout << "Goodbye!\n";
            break;
        }

        std::cin >> op >> b;

        double result = 0.0;
        bool valid = true;

        if (op == '+') {
            result = a + b;
        } else if (op == '-') {
            result = a - b;
        } else if (op == '*') {
            result = a * b;
        } else if (op == '/') {
            if (b == 0) {
                std::cout << "Error: division by zero is not allowed.\n";
                valid = false;
            } else {
                result = a / b;
            }
        } else {
            std::cout << "Error: unknown operator '" << op << "'.\n";
            valid = false;
        }

        if (valid) {
            std::cout << "Result: " << result << "\n";
        }

        std::cout << "\n";
        std::cout << "Enter another calculation, or type q and press Enter to quit.\n";
    }

    return 0;
}
