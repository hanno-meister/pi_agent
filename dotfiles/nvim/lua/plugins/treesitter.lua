return {
  "nvim-treesitter/nvim-treesitter",
  lazy = false,
  build = ":TSUpdate",
  dependencies = {
    { "windwp/nvim-ts-autotag", opts = {} },
  },
  config = function()
    require("nvim-treesitter").setup({
      install_dir = vim.fn.stdpath("data") .. "/site",
    })

    require("nvim-treesitter").install({
      "javascript",
      "html",
      "lua",
      "vim",
      "vimdoc",
      "markdown",
      "markdown_inline",
      "yaml",
      "json",
      "typescript",
      "tsx",
      "python",
      "go",
    })

    -- Enable Tree-sitter highlighting where a parser exists (Neovim feature)
    vim.api.nvim_create_autocmd("FileType", {
      callback = function(args)
        pcall(vim.treesitter.start, args.buf)
      end,
    })
  end,
}
