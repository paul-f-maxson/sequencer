import re
import fileinput


def main():
    for line in fileinput.input():
        print(
            re.sub(
                r'^.*"type":"([^"]*)".*"message":"([^"]*)".*$',
                r'\2: \1',
                line.rstrip()
            )
        )


if __name__ == "__main__":
    main()
