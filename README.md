

# Semantic Prompt Language

The repository contains `spl.agent.md` that you can copy as is and start using protocol right away. 

## What it is

SPL is lightweight protocol that allows you to "script" LLMs response. It has pseudo-Python syntax that
is easy to read.

## What it is for

If you struggle reading long-winded prose in prompts and agents you are not alone. The aim of this protocol
is to establish common vocabulary and syntax, and use it to quickly experiment with prompts.

The prompts in SPL are meant to be **shared**. LLMs natively understand this syntax even without reasoning and
should give more reproducible results than prose. Write the prompt once and get similar results anytime without
noise.

Once you have successful prompt that does what you want, check out it to Git, track the prompts in teams repository,
and share with friends.

## Scripting

Real strength lies in Bash/Powershell scripting. One example would be with copilot

```bash
copilot --silent --allow-all-tools --agent=spl -p $(cat <spl_prompt>)
```

For example this script:

```
if ?'Friday today':
    out{len='word'} 'Reverse Friday letters'
else:
    out{len='word'} 'Palindrome Friday letters'
```

You get the picture.

Then do anything you want with the response. Assert/fail keywords generate standard JSON
response so it is easy to create quality gates etc.

## Contents

* `agent` the agent for establishing protocol
* `vscode` syntax support for VSCode
* `docs` documentation site (static HTML; open `docs/index.html` or serve the folder with GitHub Pages)
* `sample-prompts` real world and validation prompts
* `scripting` terminal scripting example


## Contributing

If you found a bug or want to contribute drop me message at `dominik.gawlik1@gmail.com`

