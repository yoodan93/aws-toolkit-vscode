const path = require('path')

module.exports = {
    mode: 'production',

    entry: {
        invokeRemote: path.resolve(__dirname, 'src', 'webviews', 'tsx', 'invokeRemote.tsx'),
        createSamApp: path.resolve(__dirname, 'src', 'webviews', 'tsx', 'createSamApp.tsx')
    },
    output: {
        path: path.resolve(__dirname, 'compiledWebviews'),
        filename: '[name].js'
    },

    // Enable sourcemaps for debugging webpack's output.
    devtool: 'source-map',

    resolve: {
        // Add '.ts' and '.tsx' as resolvable extensions.
        extensions: ['.ts', '.tsx', '.js', '.json']
    },

    module: {
        rules: [
            {
                test: /\.ts(x?)$/,
                use: [
                    {
                        loader: 'ts-loader'
                    }
                ]
            },
            // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
            {
                enforce: 'pre',
                test: /\.js$/,
                loader: 'source-map-loader'
            }
        ]
    },

    // When importing a module whose path matches one of the following, just
    // assume a corresponding global variable exists and use that instead.
    // This is important because it allows us to avoid bundling all of our
    // dependencies, which allows browsers to cache those libraries between builds.
    externals: {
        react: 'React',
        'react-dom': 'ReactDOM'
    }
}